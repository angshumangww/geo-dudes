import express from "express"
import cors from "cors"
import cron from "node-cron"
import Anthropic from "@anthropic-ai/sdk"
import axios from "axios"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { AGENTS, NEWS_ANALYST, AGGREGATOR_AGENT } from "./agents.js"
import dotenv from "dotenv"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, "../.env") })
console.log("NEWS KEY:", process.env.NEWS_API_KEY)

const DATA_FILE = path.join(__dirname, "data", "topics.json")
const app = express()
app.use(cors())
app.use(express.json())

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── DATA HELPERS ─────────────────────────────────────────────────────────────

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return { topics: [] }
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) }
  catch { return { topics: [] } }
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

// ─── HELPERS ──────────────────────────────────────────────────────────────────

async function callClaude(systemPrompt, userMessage, maxTokens = 500) {
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  })
  return res.content[0].text.trim()
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

function isDuplicate(title, existingTopics) {
  const words = title.toLowerCase().split(" ").filter(w => w.length > 4)
  return existingTopics.some(t => {
    const existing = t.title.toLowerCase()
    const matches = words.filter(w => existing.includes(w)).length
    return matches >= 3
  })
}

// ─── FETCH NEWS ───────────────────────────────────────────────────────────────

async function fetchTopStory(existingTopics = []) {
  const res = await axios.get("https://newsapi.org/v2/top-headlines", {
    params: { category: "general", language: "en", pageSize: 15, apiKey: process.env.NEWS_API_KEY }
  })

  const articles = res.data.articles
    .filter(a => a.description && a.title)
    .filter(a => !isDuplicate(a.title, existingTopics))
    .slice(0, 10)
    .map(a => `TITLE: ${a.title}\nSUMMARY: ${a.description}\nSOURCE: ${a.source.name}`)
    .join("\n\n---\n\n")

  const picked = await callClaude(
    `You are a senior news editor. Pick the single most geopolitically significant story from these headlines that would spark genuine expert debate. Return ONLY raw JSON, no markdown: {"title": "...", "summary": "...", "source": "..."}`,
    articles, 200
  )

  try { return JSON.parse(picked.trim()) }
  catch {
    const a = res.data.articles[0]
    return { title: a.title, summary: a.description, source: a.source.name }
  }
}

// ─── REPLY UNDER A SPECIFIC COMMENT ──────────────────────────────────────────

async function replyToComment(agent, targetComment, story, topicId) {
  try {
    const reply = await callClaude(
      agent.system,
      `You are replying directly to ${targetComment.agentName} (${targetComment.institution}) who said:\n\n"${stripConfidence(targetComment.content)}"\n\nTopic being discussed: "${story.title}"\n\nReply to them directly. Agree, disagree, or add something they missed. Be natural and conversational — like a real person replying in a forum thread. Can be one sentence or a short paragraph. Don't be overly formal. End with: Confidence: X%`,
      280
    )

    const replyObj = {
      id: `${topicId}-r-${agent.id}-${Date.now()}`,
      topicId,
      agentId: agent.id,
      agentName: agent.name,
      institution: agent.institution,
      field: agent.field,
      tradition: agent.tradition,
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
    return true
  } catch (err) {
    console.error(`   ✗ Reply error (${agent.name}):`, err.message)
    return false
  }
}

// ─── MAIN CYCLE ───────────────────────────────────────────────────────────────

async function runForumCycle() {
  console.log("\n🔄 Forum cycle starting at", new Date().toLocaleTimeString())
  const data = loadData()

  try {
    console.log("📰 Fetching story...")
    const story = await fetchTopStory(data.topics)
    console.log("   →", story.title)

    const op = AGENTS[rand(0, AGENTS.length - 1)]
    console.log(`   OP: ${op.name}`)

    console.log("🔍 News analyst generating briefing...")
    const briefing = await callClaude(
      NEWS_ANALYST.system,
      `Topic: ${story.title}\nSummary: ${story.summary}\nSource: ${story.source}`,
      400
    )

    console.log(`💬 ${op.name} posting topic...`)
    const opPost = await callClaude(
      op.system,
      `You are posting a new discussion topic to a geopolitical analysis forum. The topic is:\n\n"${story.title}"\n\nContext:\n${briefing}\n\nPost your take on this — what's really going on and what do you think happens next.`
    )

    const topicId = Date.now().toString()
    const topic = {
      id: topicId,
      title: story.title,
      source: story.source,
      briefing,
      opAgentId: op.id,
      opAgentName: op.name,
      opInstitution: op.institution,
      opTradition: op.tradition,
      opPost,
      opConfidence: extractConfidence(opPost),
      createdAt: new Date().toISOString(),
      comments: [],
      synthesis: null,
      status: "active"
    }

    data.topics.unshift(topic)
    saveData(data)
    console.log("✅ Topic created")

    // ── STEP 1: All agents post top-level comments ──────────────────────────
    console.log("💬 Agents posting comments...")
    const commentingAgents = AGENTS
      .filter(a => a.id !== op.id)
      .filter(() => Math.random() < 0.75)

    for (const agent of commentingAgents) {
      try {
        const currentTopic = getTopic(topicId)
        const existingComments = currentTopic.comments
          .slice(-6)
          .map(c => `${c.agentName}: ${stripConfidence(c.content).slice(0, 120)}...`)
          .join("\n")

        const comment = await callClaude(
          agent.system,
          `TOPIC posted by ${op.name} (${op.institution}):\n"${story.title}"\n\n${op.name}'s take:\n${stripConfidence(opPost)}\n\nNews context:\n${briefing}\n${existingComments ? `\nOthers have said:\n${existingComments}` : ""}\n\nPost your comment on this topic.`
        )

        const commentObj = {
          id: `${topicId}-c-${agent.id}-${Date.now()}`,
          topicId,
          agentId: agent.id,
          agentName: agent.name,
          institution: agent.institution,
          field: agent.field,
          tradition: agent.tradition,
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
        console.log(`   ✓ ${agent.name}`)
        await sleep(1200 + Math.random() * 2000)

      } catch (err) {
        console.error(`   ✗ ${agent.name}:`, err.message)
      }
    }

    // ── STEP 2: Reply pass — every 1/3 agents, 80% chance they reply ────────
    console.log("↩️  Reply pass (every 1/3 agents, 80% fire rate)...")

    // Pick every 3rd agent from a shuffled list = ~10 agents
    const shuffled = [...AGENTS].sort(() => Math.random() - 0.5)
    const replyPool = shuffled.filter((_, i) => i % 3 === 0)

    for (const agent of replyPool) {
      // 80% chance this agent actually replies
      if (Math.random() > 0.80) continue

      try {
        const currentTopic = getTopic(topicId)
        // Get all comments this agent hasn't written
        const otherComments = currentTopic.comments
          .filter(c => c.agentId !== agent.id)

        if (otherComments.length === 0) continue

        // Ask Claude which comment this agent most wants to reply to
        const sampleComments = otherComments
          .sort(() => Math.random() - 0.5)
          .slice(0, 6)
          .map(c => `ID:${c.id} | ${c.agentName} (${c.institution}): ${stripConfidence(c.content).slice(0, 200)}`)
          .join("\n\n")

        const decision = await callClaude(
          agent.system,
          `TOPIC: "${story.title}"\n\nThese people have commented in the thread:\n\n${sampleComments}\n\nWhich ONE comment do you most want to reply to — either because you disagree, want to push back, or have something direct to add to what they said specifically? Return ONLY the ID of the comment you want to reply to, nothing else. Example: ${sampleComments.split("|")[0].replace("ID:", "").trim().split(" ")[0]}`,
          50
        )

        const targetId = decision.trim().split("\n")[0].trim()
        const targetComment = currentTopic.comments.find(c => c.id === targetId)
        if (!targetComment) continue

        await replyToComment(agent, targetComment, story, topicId)

      } catch (err) {
        console.error(`   ✗ Reply pass error (${agent.name}):`, err.message)
      }
    }

    // ── STEP 3: Second reply wave — replies to replies ───────────────────────
    console.log("↩️↩️  Second reply wave (replies to replies)...")

    const shuffled2 = [...AGENTS].sort(() => Math.random() - 0.5)
    const replyPool2 = shuffled2.filter((_, i) => i % 3 === 0)

    for (const agent of replyPool2) {
      if (Math.random() > 0.80) continue

      try {
        const currentTopic = getTopic(topicId)
        // Look at replies that have been posted (depth > 0) or any comment
        const replyableComments = currentTopic.comments
          .filter(c => c.agentId !== agent.id)
          .filter(c => c.depth > 0 || currentTopic.comments.filter(r => r.parentId === c.id).length > 0)

        if (replyableComments.length === 0) continue

        const target = replyableComments[Math.floor(Math.random() * replyableComments.length)]
        await replyToComment(agent, target, story, topicId)

      } catch (err) { /* skip */ }
    }

    // ── STEP 4: Confidence updates ──────────────────────────────────────────
    console.log("📊 Confidence updates...")
    const topicForUpdates = getTopic(topicId)
    const topLevelComments = topicForUpdates.comments.filter(c => c.parentId === null)

    for (const comment of topLevelComments) {
      const replies = topicForUpdates.comments.filter(c => c.parentId === comment.id)
      if (replies.length === 0) continue

      const agent = AGENTS.find(a => a.id === comment.agentId)
      if (!agent) continue

      try {
        const challengeText = replies.map(r => `${r.agentName}: ${stripConfidence(r.content)}`).join("\n\n")
        const update = await callClaude(
          agent.system,
          `You said:\n${stripConfidence(comment.content)}\n\nYou received these replies:\n${challengeText}\n\nHaving read their responses, write 1-2 sentences on whether your view has changed at all and why, then end with: Confidence: X%`,
          180
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

    // ── STEP 5: Agent voting ─────────────────────────────────────────────────
    console.log("🗳️  Agent voting...")
    const topicForVoting = getTopic(topicId)
    const votableComments = topicForVoting.comments.filter(c => c.parentId === null)

    for (const voter of AGENTS) {
      if (Math.random() < 0.4) continue

      try {
        const sample = votableComments
          .filter(c => c.agentId !== voter.id)
          .sort(() => Math.random() - 0.5)
          .slice(0, 4)

        if (sample.length === 0) continue

        const commentList = sample
          .map(c => `ID:${c.id} | ${c.agentName}: ${stripConfidence(c.content).slice(0, 100)}`)
          .join("\n")

        const voteDecision = await callClaude(
          voter.system,
          `TOPIC: "${story.title}"\n\nRate these comments. For each, say UP, DOWN, or SKIP based on how insightful you find the analysis. Return ONLY raw JSON array, no markdown:\n[{"id": "...", "vote": "UP"}, {"id": "...", "vote": "DOWN"}, ...]\n\nComments:\n${commentList}`,
          200
        )

        let votes = []
        try {
          const clean = voteDecision.replace(/```json|```/g, "").trim()
          votes = JSON.parse(clean)
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

    // ── STEP 6: Synthesis ────────────────────────────────────────────────────
    console.log("🔮 Synthesis...")
    const finalTopic = getTopic(topicId)
    const allComments = finalTopic.comments
      .filter(c => c.parentId === null)
      .map(c => `${c.agentName} (${c.institution}): ${stripConfidence(c.content)}`)
      .join("\n\n---\n\n")

    const synthesis = await callClaude(
      AGGREGATOR_AGENT.system,
      `TOPIC: ${story.title}\n\nOP (${op.name}): ${stripConfidence(opPost)}\n\nCOMMENTS:\n${allComments}`,
      500
    )

    updateTopic(topicId, t => { t.synthesis = synthesis; t.status = "complete" })
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
    opAgentName: t.opAgentName,
    opTradition: t.opTradition,
    commentCount: t.comments.length,
    hasSynthesis: !!t.synthesis
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
  saveData({ topics: [] })
  res.json({ message: "All data cleared" })
})

app.get("/health", (req, res) => res.json({ status: "ok" }))

cron.schedule("0 0,6,12,18 * * *", runForumCycle)

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`\n🌍 Geo-Dudes on http://localhost:${PORT}`)
  console.log("🔧 Trigger: Invoke-WebRequest -Uri http://localhost:3001/run -Method POST")
  console.log("🗑️  Clear data: Invoke-WebRequest -Uri http://localhost:3001/data -Method DELETE\n")
})