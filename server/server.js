import express from "express"
import cors from "cors"
import cron from "node-cron"
import Anthropic from "@anthropic-ai/sdk"
import axios from "axios"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { AGENTS, ANALYST_AGENT, AGGREGATOR_AGENT } from "./agents.js"
import dotenv from "dotenv"
dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_FILE = path.join(__dirname, "data", "topics.json")

const app = express()
app.use(cors())
app.use(express.json())

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── DATA HELPERS ─────────────────────────────────────────────────────────────

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return { topics: [] }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))
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

// ─── CLAUDE HELPER ────────────────────────────────────────────────────────────

async function callClaude(systemPrompt, userMessage, maxTokens = 600) {
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  })
  return res.content[0].text
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// Pull confidence number out of post text
function extractConfidence(text) {
  const match = text.match(/Confidence:\s*(\d+)%/i)
  return match ? parseInt(match[1]) : null
}

// ─── FETCH TOP STORY ─────────────────────────────────────────────────────────

async function fetchTopStory() {
  const res = await axios.get("https://newsapi.org/v2/top-headlines", {
    params: {
      category: "general",
      language: "en",
      pageSize: 10,
      apiKey: process.env.NEWS_API_KEY,
    },
  })

  const articles = res.data.articles
    .filter(a => a.description && a.title)
    .slice(0, 8)
    .map(a => `TITLE: ${a.title}\nSUMMARY: ${a.description}\nSOURCE: ${a.source.name}`)
    .join("\n\n---\n\n")

  const picked = await callClaude(
    `You are a senior news editor. Given these headlines, pick the most geopolitically significant story.
Return ONLY raw JSON, no markdown, no backticks:
{"title": "...", "summary": "...", "source": "..."}`,
    articles,
    200
  )

  try {
    return JSON.parse(picked.trim())
  } catch {
    const a = res.data.articles[0]
    return { title: a.title, summary: a.description, source: a.source.name }
  }
}

// ─── MAIN FORUM CYCLE ────────────────────────────────────────────────────────

async function runForumCycle() {
  console.log("\n🔄 Starting forum cycle at", new Date().toLocaleTimeString())

  try {
    // 1. Fetch top story
    console.log("📰 Fetching top story...")
    const story = await fetchTopStory()
    console.log("   →", story.title)

    // 2. Analyst produces briefing
    console.log("🔍 Generating briefing...")
    const briefing = await callClaude(
      ANALYST_AGENT.system,
      `NEWS STORY:\nTitle: ${story.title}\nSummary: ${story.summary}\nSource: ${story.source}`,
      500
    )

    // 3. Create topic
    const topicId = Date.now().toString()
    const topic = {
      id: topicId,
      title: story.title,
      source: story.source,
      briefing,
      createdAt: new Date().toISOString(),
      posts: [],
      synthesis: null,
      status: "active"
    }

    const data = loadData()
    data.topics.unshift(topic)
    saveData(data)
    console.log("✅ Topic created:", topicId)

    // 4. All 30 agents post their initial analysis
    console.log("💬 Agents posting initial analysis...")
    for (const agent of AGENTS) {
      try {
        const response = await callClaude(
          agent.system,
          `BRIEFING:\n${briefing}\n\nPost your analysis.`
        )

        const post = {
          id: `${topicId}-${agent.id}`,
          topicId,
          agentId: agent.id,
          agentName: agent.name,
          institution: agent.institution,
          field: agent.field,
          tradition: agent.tradition,
          content: response,
          confidence: extractConfidence(response),
          confidenceHistory: [],
          parentId: null,
          upvotes: 0,
          createdAt: new Date().toISOString(),
          type: "analysis"
        }

        updateTopic(topicId, t => t.posts.push(post))
        console.log(`   ✓ ${agent.name}`)
        await sleep(2000 + Math.random() * 3000)

      } catch (err) {
        console.error(`   ✗ ${agent.name}:`, err.message)
      }
    }

    // 5. Reply pass — 8 agents reply to each other
    console.log("↩️  Reply pass...")
    const replyAgents = [...AGENTS].sort(() => Math.random() - 0.5).slice(0, 8)

    for (const agent of replyAgents) {
      try {
        const currentTopic = getTopic(topicId)
        const threadSummary = currentTopic.posts
          .filter(p => p.type === "analysis" && p.agentId !== agent.id)
          .map(p => `${p.agentName} (${p.institution}): ${p.content.slice(0, 200)}...`)
          .join("\n\n")

        const reply = await callClaude(
          agent.system,
          `BRIEFING:\n${briefing}\n\nOTHER ANALYSTS HAVE POSTED:\n${threadSummary}\n\nDo you disagree strongly enough with any specific analyst to reply directly to them? If yes, write a direct reply — name them and challenge their reasoning. If you have nothing strong to add, reply with just: PASS`,
          350
        )

        if (reply.trim().toUpperCase() === "PASS") continue

        const allPosts = currentTopic.posts
        const mentionedPost = allPosts.find(p =>
          reply.includes(p.agentName.split(" ").pop()) && p.agentId !== agent.id
        ) || allPosts.find(p => p.agentId !== agent.id)

        const replyPost = {
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
          parentId: mentionedPost ? mentionedPost.id : null,
          upvotes: 0,
          createdAt: new Date().toISOString(),
          type: "reply"
        }

        updateTopic(topicId, t => t.posts.push(replyPost))
        console.log(`   ↩ ${agent.name} replied`)
        await sleep(2000 + Math.random() * 2000)

      } catch (err) {
        console.error(`   ✗ Reply from ${agent.name}:`, err.message)
      }
    }

    // 6. Confidence update pass — agents who got replies re-evaluate their confidence
    console.log("🔄 Confidence update pass...")
    const topicAfterReplies = getTopic(topicId)
    const analysisPosts = topicAfterReplies.posts.filter(p => p.type === "analysis")

    for (const post of analysisPosts) {
      const repliesReceived = topicAfterReplies.posts.filter(
        p => p.type === "reply" && p.parentId === post.id
      )
      if (repliesReceived.length === 0) continue

      const agent = AGENTS.find(a => a.id === post.agentId)
      if (!agent) continue

      try {
        const challengeText = repliesReceived
          .map(r => `${r.agentName}: ${r.content}`)
          .join("\n\n")

        const update = await callClaude(
          agent.system,
          `You posted this analysis:\n${post.content}\n\nYou received these challenges:\n${challengeText}\n\nHaving read their arguments, do you want to revise your confidence level? Write 1-2 sentences explaining whether your view has changed and why, then end with: Confidence: X%\n\nIf your view is unchanged, say so briefly and give the same confidence. If genuinely persuaded on something, adjust it.`,
          200
        )

        const newConfidence = extractConfidence(update)
        if (newConfidence !== null && newConfidence !== post.confidence) {
          updateTopic(topicId, t => {
            const p = t.posts.find(p => p.id === post.id)
            if (p) {
              p.confidenceHistory.push({ confidence: p.confidence, at: new Date().toISOString() })
              p.confidence = newConfidence
              p.confidenceNote = update
            }
          })
          console.log(`   📊 ${agent.name}: ${post.confidence}% → ${newConfidence}%`)
        }

        await sleep(1500)
      } catch (err) {
        console.error(`   ✗ Confidence update for ${agent.name}:`, err.message)
      }
    }

    // 7. Synthesis
    console.log("🔮 Generating synthesis...")
    const finalTopic = getTopic(topicId)
    const allPosts = finalTopic.posts
      .filter(p => p.type === "analysis")
      .map(p => `${p.agentName} (${p.institution}, ${p.field}):\n${p.content}`)
      .join("\n\n---\n\n")

    const synthesis = await callClaude(
      AGGREGATOR_AGENT.system,
      `TOPIC: ${story.title}\n\nANALYST POSTS:\n${allPosts}`,
      600
    )

    updateTopic(topicId, t => {
      t.synthesis = synthesis
      t.status = "complete"
    })

    console.log("✅ Forum cycle complete!\n")

  } catch (err) {
    console.error("❌ Forum cycle failed:", err.message)
  }
}

// ─── API ROUTES ───────────────────────────────────────────────────────────────

// All topics (list)
app.get("/topics", (req, res) => {
  const data = loadData()
  res.json(data.topics.map(t => ({
    id: t.id,
    title: t.title,
    source: t.source,
    createdAt: t.createdAt,
    status: t.status,
    postCount: t.posts.length,
    hasSynthesis: !!t.synthesis
  })))
})

// Single topic with all posts
app.get("/topics/:id", (req, res) => {
  const data = loadData()
  const topic = data.topics.find(t => t.id === req.params.id)
  if (!topic) return res.status(404).json({ error: "Not found" })
  res.json(topic)
})

// Upvote a post
app.post("/topics/:topicId/posts/:postId/upvote", (req, res) => {
  const data = loadData()
  const topic = data.topics.find(t => t.id === req.params.topicId)
  if (!topic) return res.status(404).json({ error: "Topic not found" })
  const post = topic.posts.find(p => p.id === req.params.postId)
  if (!post) return res.status(404).json({ error: "Post not found" })
  post.upvotes = (post.upvotes || 0) + 1
  saveData(data)
  res.json({ upvotes: post.upvotes })
})

// Manually trigger a cycle
app.post("/run", async (req, res) => {
  res.json({ message: "Cycle started — watch your terminal" })
  runForumCycle()
})

app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() })
})

// ─── SCHEDULER ────────────────────────────────────────────────────────────────

cron.schedule("0 0,6,12,18 * * *", () => {
  runForumCycle()
})

// ─── START ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`\n🌍 Geo-Dudes backend on http://localhost:${PORT}`)
  console.log("📅 Auto-runs every 6 hours")
  console.log("🔧 Trigger: curl -X POST http://localhost:3001/run\n")
})