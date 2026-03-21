import express from "express"
import cors from "cors"
import cron from "node-cron"
import Anthropic from "@anthropic-ai/sdk"
import Groq from "groq-sdk"
import axios from "axios"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { CLAUDE_AGENTS, GROQ_AGENTS, ALL_AGENTS, NEWS_ANALYST, AGGREGATOR_AGENT } from "./agents.js"
import dotenv from "dotenv"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, "../.env") })
console.log("NEWS KEY:", process.env.NEWS_API_KEY ? "✓ loaded" : "✗ missing")
console.log("GROQ KEY:", process.env.GROQ_API_KEY ? "✓ loaded" : "✗ missing")
console.log("ANTHROPIC KEY:", process.env.ANTHROPIC_API_KEY ? "✓ loaded" : "✗ missing")

const DATA_FILE = path.join(__dirname, "data", "topics.json")
const app = express()
app.use(cors())
app.use(express.json())

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

// ─── DATA HELPERS ─────────────────────────────────────────────────────────────

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return { topics: [], usedHeadlines: [] }
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))
    if (!d.usedHeadlines) d.usedHeadlines = []
    return d
  } catch { return { topics: [], usedHeadlines: [] } }
}

function saveData(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true })
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
}

function getTopic(topicId) {
  return loadData().topics.find(t => t.id === topicId)
}

function updateTopic(topicId, fn) {
  const data = loadData()
  const idx = data.topics.findIndex(t => t.id === topicId)
  if (idx === -1) return
  fn(data.topics[idx])
  saveData(data)
}

// ─── API HELPERS ──────────────────────────────────────────────────────────────

async function callClaude(systemPrompt, userMessage, maxTokens = 500) {
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  })
  return res.content[0].text.trim()
}

async function callGroq(systemPrompt, userMessage, maxTokens = 600) {
  const res = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ]
  })
  return res.choices[0].message.content.trim()
}

// Route to correct model based on agent type
async function callAgent(agent, userMessage, maxTokens = 500) {
  const isGroqAgent = agent.id >= 31
  if (isGroqAgent) {
    return await callGroq(agent.system, userMessage, maxTokens)
  } else {
    return await callClaude(agent.system, userMessage, maxTokens)
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }

function extractConfidence(text) {
  const m = text.match(/Confidence:\s*(\d+)%/i)
  return m ? parseInt(m[1]) : null
}

function stripConfidence(text) {
  return text.replace(/\n?Confidence:\s*\d+%\s*$/i, "").trim()
}

// ─── DEDUP ────────────────────────────────────────────────────────────────────

function normaliseTitle(title) {
  return title.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim()
}

function isHeadlineUsed(title, usedHeadlines) {
  const norm = normaliseTitle(title)
  const words = norm.split(" ").filter(w => w.length > 4)
  return usedHeadlines.some(used => {
    const usedWords = normaliseTitle(used).split(" ").filter(w => w.length > 4)
    return words.filter(w => usedWords.includes(w)).length >= 3
  })
}

function isTopicDuplicate(title, existingTopics) {
  const norm = normaliseTitle(title)
  const words = norm.split(" ").filter(w => w.length > 4)
  return existingTopics.some(t => {
    const existing = normaliseTitle(t.title).split(" ").filter(w => w.length > 4)
    return words.filter(w => existing.includes(w)).length >= 3
  })
}

// ─── TOPIC CLASSIFICATION ─────────────────────────────────────────────────────

const GEO_KEYWORDS = [
  "war", "military", "sanctions", "nuclear", "treaty", "election",
  "president", "minister", "government", "parliament", "congress",
  "trade", "tariff", "economy", "gdp", "inflation", "recession",
  "diplomatic", "alliance", "nato", "united nations", "conflict",
  "ceasefire", "invasion", "coup", "crisis", "missile", "troops",
  "border", "territory", "oil", "gas", "energy", "currency", "debt",
  "referendum", "assassination", "summit", "negotiations", "embargo"
]

function isGeopolitical(title, description = "") {
  const text = (title + " " + (description || "")).toLowerCase()
  return GEO_KEYWORDS.some(k => text.includes(k))
}

// Pick the right agent pool based on topic type
// Geopolitical: 70% Claude agents + 30% Groq agents
// General: 30% Claude agents + 70% Groq agents
function selectAgents(isGeo, opId) {
  const shuffledClaude = [...CLAUDE_AGENTS].filter(a => a.id !== opId).sort(() => Math.random() - 0.5)
  const shuffledGroq = [...GROQ_AGENTS].sort(() => Math.random() - 0.5)

  let claudeCount, groqCount
  if (isGeo) {
    claudeCount = Math.floor(shuffledClaude.length * 0.70)
    groqCount = Math.floor(shuffledGroq.length * 0.30)
  } else {
    claudeCount = Math.floor(shuffledClaude.length * 0.30)
    groqCount = Math.floor(shuffledGroq.length * 0.70)
  }

  const pool = [
    ...shuffledClaude.slice(0, claudeCount),
    ...shuffledGroq.slice(0, groqCount)
  ].sort(() => Math.random() - 0.5)

  return pool.filter(() => Math.random() < 0.75)
}

// ─── FETCH NEWS ───────────────────────────────────────────────────────────────

async function fetchTopStory() {
  const data = loadData()

  const categories = ["general", "business", "technology", "health", "science"]
  let candidates = []

  for (const category of categories) {
    try {
      const res = await axios.get("https://newsapi.org/v2/top-headlines", {
        params: { category, language: "en", pageSize: 20, apiKey: process.env.NEWS_API_KEY }
      })
      const filtered = res.data.articles
        .filter(a => a.title && a.description)
        .filter(a => !isHeadlineUsed(a.title, data.usedHeadlines))
        .filter(a => !isTopicDuplicate(a.title, data.topics))
      candidates.push(...filtered)
    } catch { /* skip */ }
  }

  // Deduplicate
  const seen = new Set()
  candidates = candidates.filter(a => {
    const norm = normaliseTitle(a.title)
    if (seen.has(norm)) return false
    seen.add(norm)
    return true
  })

  if (candidates.length === 0) {
    throw new Error("No new stories found — all recent headlines already used")
  }

  const articleList = candidates
    .slice(0, 15)
    .map((a, i) => `${i + 1}. TITLE: ${a.title}\nSUMMARY: ${a.description}\nSOURCE: ${a.source.name}`)
    .join("\n\n")

  const picked = await callGroq(
    `You are a news editor. Pick the single most interesting and debate-worthy story from this list — it can be about anything: politics, science, health, technology, culture, economics, sport, environment. Avoid purely celebrity or entertainment fluff. Return ONLY raw JSON: {"index": N, "title": "...", "summary": "...", "source": "..."}`,
    articleList, 200
  )

  try {
    const result = JSON.parse(picked.trim())
    const chosen = candidates[result.index - 1] || candidates[0]
    return {
      title: result.title || chosen.title,
      summary: result.summary || chosen.description,
      source: result.source || chosen.source.name,
      isGeo: isGeopolitical(result.title || chosen.title, result.summary || chosen.description)
    }
  } catch {
    const fallback = candidates[0]
    return {
      title: fallback.title,
      summary: fallback.description,
      source: fallback.source.name,
      isGeo: isGeopolitical(fallback.title, fallback.description)
    }
  }
}

// ─── REPLY TO A COMMENT ───────────────────────────────────────────────────────

async function replyToComment(agent, targetComment, story, topicId) {
  try {
    const reply = await callAgent(
      agent,
      `You are replying to ${targetComment.agentName} (${targetComment.institution || targetComment.country}) who said:\n\n"${stripConfidence(targetComment.content)}"\n\nTopic: "${story.title}"\n\nReply directly and naturally. Agree, push back, or add something they missed. Conversational tone. End with: Confidence: X%`,
      280
    )

    const replyObj = {
      id: `${topicId}-r-${agent.id}-${Date.now()}`,
      topicId,
      agentId: agent.id,
      agentName: agent.name,
      institution: agent.institution || agent.country,
      field: agent.field,
      tradition: agent.tradition || "GENERAL",
      isGroqAgent: agent.id >= 31,
      content: reply,
      confidence: extractConfidence(reply),
      confidenceHistory: [],
      confidenceNote: null,
      parentId: targetComment.id,
      upvotes: 0,
      downvotes: 0,
      createdAt: new Date().toISOString(),
      depth: (targetComment.depth || 0) + 1
    }

    updateTopic(topicId, t => t.comments.push(replyObj))
    console.log(`   ↩ ${agent.name} → ${targetComment.agentName}`)
    await sleep(1000 + Math.random() * 1500)
  } catch (err) {
    console.error(`   ✗ Reply error (${agent.name}):`, err.message)
  }
}

// ─── RETROACTIVE COMMENTS ─────────────────────────────────────────────────────

async function retroactiveComments(newStory, topicId) {
  const data = loadData()
  const recentCompleted = data.topics.filter(t =>
    t.id !== topicId &&
    t.status === "complete" &&
    Date.now() - new Date(t.createdAt).getTime() < 48 * 60 * 60 * 1000
  )

  if (recentCompleted.length === 0) return

  const topicList = recentCompleted.slice(0, 5).map(t => `ID:${t.id} | ${t.title}`).join("\n")

  const relevanceCheck = await callClaude(
    `Check if a new story is meaningfully related to old discussions — not vaguely connected but genuinely relevant in a way that would prompt follow-up. Return ONLY raw JSON array of related IDs (max 2) or []: ["id1"]`,
    `New story: "${newStory.title}"\n\nOld topics:\n${topicList}`, 100
  )

  let relatedIds = []
  try { relatedIds = JSON.parse(relevanceCheck.replace(/```json|```/g, "").trim()) }
  catch { return }

  if (relatedIds.length === 0) return
  console.log(`🔄 Retroactive comments on ${relatedIds.length} old topic(s)...`)

  for (const oldTopicId of relatedIds) {
    const oldTopic = recentCompleted.find(t => t.id === oldTopicId)
    if (!oldTopic) continue

    const agents = [...ALL_AGENTS].sort(() => Math.random() - 0.5).slice(0, 3)

    for (const agent of agents) {
      if (Math.random() > 0.7) continue
      try {
        const comment = await callAgent(
          agent,
          `You previously discussed: "${oldTopic.title}"\n\nA new development just emerged: "${newStory.title}"\nSummary: ${newStory.summary}\n\nDrop a brief follow-up on the old thread. Does this change anything? Natural and conversational. End with: Confidence: X%`,
          250
        )

        updateTopic(oldTopicId, t => t.comments.push({
          id: `${oldTopicId}-retro-${agent.id}-${Date.now()}`,
          topicId: oldTopicId,
          agentId: agent.id,
          agentName: agent.name,
          institution: agent.institution || agent.country,
          field: agent.field,
          tradition: agent.tradition || "GENERAL",
          isGroqAgent: agent.id >= 31,
          content: comment,
          confidence: extractConfidence(comment),
          confidenceHistory: [],
          confidenceNote: null,
          parentId: null,
          upvotes: 0,
          downvotes: 0,
          createdAt: new Date().toISOString(),
          depth: 0,
          isRetroactive: true
        }))

        console.log(`   🔄 ${agent.name} → old: ${oldTopic.title.slice(0, 40)}...`)
        await sleep(1500)
      } catch (err) { /* skip */ }
    }
  }
}

// ─── MAIN CYCLE ───────────────────────────────────────────────────────────────

async function runForumCycle() {
  console.log("\n🔄 Forum cycle starting at", new Date().toLocaleTimeString())
  const data = loadData()

  try {
    // 1. Fetch story
    console.log("📰 Fetching story...")
    const story = await fetchTopStory()
    console.log("   →", story.title)
    console.log("   Type:", story.isGeo ? "🌍 Geopolitical" : "📰 General")

    // 2. Mark as used
    data.usedHeadlines = data.usedHeadlines || []
    data.usedHeadlines.push(story.title)
    if (data.usedHeadlines.length > 100) data.usedHeadlines = data.usedHeadlines.slice(-100)
    saveData(data)

    // 3. Groq writes briefing
    console.log("🔍 Groq writing briefing...")
    const briefing = await callGroq(
      NEWS_ANALYST.system,
      `Topic: ${story.title}\nSummary: ${story.summary}\nSource: ${story.source}`,
      500
    )

    // 4. Pick OP — from Claude agents if geo, from either if general
    const opPool = story.isGeo ? CLAUDE_AGENTS : ALL_AGENTS
    const op = opPool[rand(0, opPool.length - 1)]
    console.log(`   OP: ${op.name} (${op.id >= 31 ? "Groq" : "Claude"})`)

    // 5. OP posts in Reddit style
    console.log(`💬 ${op.name} posting topic...`)
    const opPost = await callAgent(
      op,
      `You are posting on an online forum. The topic is:\n\n"${story.title}"\n\nContext:\n${briefing}\n\nPost your take naturally — share your view, flag what's uncertain, and pose 1-2 genuine questions to spark discussion. Take a position and invite pushback. Don't just summarise. End with: Confidence: X%`,
      450
    )

    const topicId = Date.now().toString()
    const topic = {
      id: topicId,
      title: story.title,
      source: story.source,
      briefing,
      isGeo: story.isGeo,
      opAgentId: op.id,
      opAgentName: op.name,
      opInstitution: op.institution || op.country,
      opTradition: op.tradition || "GENERAL",
      opIsGroq: op.id >= 31,
      opPost,
      opConfidence: extractConfidence(opPost),
      createdAt: new Date().toISOString(),
      comments: [],
      synthesis: null,
      status: "active"
    }

    const freshData = loadData()
    freshData.topics.unshift(topic)
    saveData(freshData)
    console.log("✅ Topic created")

    // 6. Select and run commenting agents
    console.log("💬 Agents commenting...")
    const commentingAgents = selectAgents(story.isGeo, op.id)

    for (const agent of commentingAgents) {
      try {
        const currentTopic = getTopic(topicId)
        const existingComments = currentTopic.comments
          .slice(-5)
          .map(c => `${c.agentName}: ${stripConfidence(c.content).slice(0, 100)}...`)
          .join("\n")

        const comment = await callAgent(
          agent,
          `${op.name} posted this on a forum:\n\n"${story.title}"\n\n${stripConfidence(opPost)}\n\nContext: ${briefing}\n${existingComments ? `\nOthers have said:\n${existingComments}` : ""}\n\nPost your comment — agree, disagree, or add your perspective from your background. Be natural. End with: Confidence: X%`
        )

        const commentObj = {
          id: `${topicId}-c-${agent.id}-${Date.now()}`,
          topicId,
          agentId: agent.id,
          agentName: agent.name,
          institution: agent.institution || agent.country,
          field: agent.field,
          tradition: agent.tradition || "GENERAL",
          isGroqAgent: agent.id >= 31,
          content: comment,
          confidence: extractConfidence(comment),
          confidenceHistory: [],
          confidenceNote: null,
          parentId: null,
          upvotes: 0,
          downvotes: 0,
          createdAt: new Date().toISOString(),
          depth: 0
        }

        updateTopic(topicId, t => t.comments.push(commentObj))
        console.log(`   ✓ ${agent.name} (${agent.id >= 31 ? "Groq" : "Claude"})`)
        await sleep(1200 + Math.random() * 2000)

      } catch (err) {
        console.error(`   ✗ ${agent.name}:`, err.message)
      }
    }

    // 7. Reply pass
    console.log("↩️  Reply pass...")
    const shuffled = [...ALL_AGENTS].sort(() => Math.random() - 0.5)
    const replyPool = shuffled.filter((_, i) => i % 3 === 0)

    for (const agent of replyPool) {
      if (Math.random() > 0.80) continue
      try {
        const currentTopic = getTopic(topicId)
        const otherComments = currentTopic.comments
          .filter(c => c.agentId !== agent.id)
          .sort(() => Math.random() - 0.5)
          .slice(0, 6)

        if (otherComments.length === 0) continue

        const sampleList = otherComments
          .map(c => `ID:${c.id} | ${c.agentName}: ${stripConfidence(c.content).slice(0, 180)}`)
          .join("\n\n")

        const decision = await callAgent(
          agent,
          `TOPIC: "${story.title}"\n\nThese people have commented:\n\n${sampleList}\n\nWhich ONE comment do you most want to reply to? Return ONLY the raw ID string, nothing else.`,
          50
        )

        const targetId = decision.trim().split("\n")[0].trim()
        const targetComment = currentTopic.comments.find(c => c.id === targetId)
        if (!targetComment) continue

        await replyToComment(agent, targetComment, story, topicId)
      } catch (err) { /* skip */ }
    }

    // 8. Second reply wave
    console.log("↩️↩️  Second reply wave...")
    const shuffled2 = [...ALL_AGENTS].sort(() => Math.random() - 0.5)
    const replyPool2 = shuffled2.filter((_, i) => i % 3 === 0)

    for (const agent of replyPool2) {
      if (Math.random() > 0.80) continue
      try {
        const currentTopic = getTopic(topicId)
        const replyable = currentTopic.comments
          .filter(c => c.agentId !== agent.id && c.depth > 0)
        if (replyable.length === 0) continue
        const target = replyable[Math.floor(Math.random() * replyable.length)]
        await replyToComment(agent, target, story, topicId)
      } catch (err) { /* skip */ }
    }

    // 9. Confidence updates
    console.log("📊 Confidence updates...")
    const topicForUpdates = getTopic(topicId)

    for (const comment of topicForUpdates.comments.filter(c => c.parentId === null)) {
      const replies = topicForUpdates.comments.filter(c => c.parentId === comment.id)
      if (replies.length === 0) continue

      const agent = ALL_AGENTS.find(a => a.id === comment.agentId)
      if (!agent) continue

      try {
        const challengeText = replies.map(r => `${r.agentName}: ${stripConfidence(r.content)}`).join("\n\n")
        const update = await callAgent(
          agent,
          `You said:\n${stripConfidence(comment.content)}\n\nReplies received:\n${challengeText}\n\nWrite 1-2 sentences on whether your view shifted and why, then end with: Confidence: X%`,
          150
        )

        const newConf = extractConfidence(update)
        if (newConf !== null && newConf !== comment.confidence) {
          updateTopic(topicId, t => {
            const c = t.comments.find(c => c.id === comment.id)
            if (c) {
              c.confidenceHistory.push({ confidence: c.confidence, at: new Date().toISOString() })
              c.confidence = newConf
              c.confidenceNote = update
            }
          })
          console.log(`   📊 ${agent.name}: ${comment.confidence}% → ${newConf}%`)
        }
        await sleep(800)
      } catch (err) { /* skip */ }
    }

    // 10. Agent voting
    console.log("🗳️  Agent voting...")
    const topicForVoting = getTopic(topicId)
    const votableComments = topicForVoting.comments.filter(c => c.parentId === null)

    for (const voter of ALL_AGENTS) {
      if (Math.random() < 0.5) continue
      try {
        const sample = votableComments
          .filter(c => c.agentId !== voter.id)
          .sort(() => Math.random() - 0.5)
          .slice(0, 4)
        if (sample.length === 0) continue

        const commentList = sample
          .map(c => `ID:${c.id} | ${c.agentName}: ${stripConfidence(c.content).slice(0, 100)}`)
          .join("\n")

        const voteDecision = await callAgent(
          voter,
          `TOPIC: "${story.title}"\n\nRate these comments UP, DOWN, or SKIP based on insight and quality. Return ONLY raw JSON array:\n[{"id": "...", "vote": "UP"}]\n\nComments:\n${commentList}`,
          150
        )

        let votes = []
        try {
          votes = JSON.parse(voteDecision.replace(/```json|```/g, "").trim())
        } catch { continue }

        updateTopic(topicId, t => {
          for (const v of votes) {
            const c = t.comments.find(c => c.id === v.id)
            if (!c) continue
            if (v.vote === "UP") c.upvotes = (c.upvotes || 0) + 1
            if (v.vote === "DOWN") c.downvotes = (c.downvotes || 0) + 1
          }
        })
        await sleep(600)
      } catch (err) { /* skip */ }
    }

    // 11. Synthesis
    console.log("🔮 Synthesis...")
    const finalTopic = getTopic(topicId)
    const allComments = finalTopic.comments
      .filter(c => c.parentId === null)
      .map(c => `${c.agentName} (${c.institution}, ${c.field}): ${stripConfidence(c.content)}`)
      .join("\n\n---\n\n")

    const synthesis = await callClaude(
      AGGREGATOR_AGENT.system,
      `TOPIC: ${story.title}\n\nOP (${op.name}): ${stripConfidence(opPost)}\n\nCOMMENTS:\n${allComments}`,
      600
    )

    updateTopic(topicId, t => { t.synthesis = synthesis; t.status = "complete" })

    // 12. Retroactive comments
    await retroactiveComments(story, topicId)

    console.log("✅ Cycle complete!\n")

  } catch (err) {
    console.error("❌ Cycle failed:", err.message)
  }
}

// ─── API ROUTES ───────────────────────────────────────────────────────────────

app.get("/topics", (req, res) => {
  const data = loadData()
  res.json(data.topics.map(t => ({
    id: t.id,
    title: t.title,
    source: t.source,
    createdAt: t.createdAt,
    status: t.status,
    isGeo: t.isGeo,
    opAgentName: t.opAgentName,
    opTradition: t.opTradition,
    opIsGroq: t.opIsGroq,
    commentCount: t.comments.length,
    hasSynthesis: !!t.synthesis,
    hasRetroactive: t.comments.some(c => c.isRetroactive)
  })))
})

app.get("/topics/:id", (req, res) => {
  const data = loadData()
  const topic = data.topics.find(t => t.id === req.params.id)
  if (!topic) return res.status(404).json({ error: "Not found" })
  res.json(topic)
})

app.post("/topics/:topicId/comments/:commentId/upvote", (req, res) => {
  const data = loadData()
  const topic = data.topics.find(t => t.id === req.params.topicId)
  if (!topic) return res.status(404).json({ error: "Not found" })
  const comment = topic.comments.find(c => c.id === req.params.commentId)
  if (!comment) return res.status(404).json({ error: "Not found" })
  comment.upvotes = (comment.upvotes || 0) + 1
  saveData(data)
  res.json({ upvotes: comment.upvotes, downvotes: comment.downvotes })
})

app.post("/topics/:topicId/comments/:commentId/downvote", (req, res) => {
  const data = loadData()
  const topic = data.topics.find(t => t.id === req.params.topicId)
  if (!topic) return res.status(404).json({ error: "Not found" })
  const comment = topic.comments.find(c => c.id === req.params.commentId)
  if (!comment) return res.status(404).json({ error: "Not found" })
  comment.downvotes = (comment.downvotes || 0) + 1
  saveData(data)
  res.json({ upvotes: comment.upvotes, downvotes: comment.downvotes })
})

app.post("/run", async (req, res) => {
  res.json({ message: "Cycle started" })
  runForumCycle()
})

app.delete("/data", (req, res) => {
  saveData({ topics: [], usedHeadlines: [] })
  res.json({ message: "All data cleared" })
})

app.get("/health", (req, res) => res.json({ status: "ok" }))

cron.schedule("0 0,6,12,18 * * *", runForumCycle)

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`\n🌍 Geo-Dudes on http://localhost:${PORT}`)
  console.log("🔧 Trigger: Invoke-WebRequest -Uri http://localhost:3001/run -Method POST")
  console.log("🗑️  Clear: Invoke-WebRequest -Uri http://localhost:3001/data -Method DELETE\n")
})