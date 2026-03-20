import { useState, useEffect, useRef } from "react"

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=IBM+Plex+Mono:wght@400;500;600&family=Cormorant+Garamond:wght@300;400;600;700&display=swap');`

const API = "http://localhost:3001"

const TRADITIONS = {
  REALIST:        { label: "Realist",                color: "#f59e0b", dim: "#92400e" },
  LIBERAL:        { label: "Liberal Institutionalist",color: "#38bdf8", dim: "#075985" },
  CONSTRUCTIVIST: { label: "Constructivist",          color: "#a78bfa", dim: "#4c1d95" },
  AREA:           { label: "Area Specialist",         color: "#34d399", dim: "#064e3b" },
  MILITARY:       { label: "Military / Security",     color: "#f87171", dim: "#7f1d1d" },
  ECONOMIC:       { label: "Political Economy",       color: "#fb923c", dim: "#7c2d12" },
  GLOBAL_SOUTH:   { label: "Global South",            color: "#22d3ee", dim: "#164e63" },
  INTELLIGENCE:   { label: "Intelligence / Ops",      color: "#e879f9", dim: "#581c87" },
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function initials(name) {
  const parts = name.split(" ")
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Strip the "Confidence: X%" line from displayed content
function stripConfidence(text) {
  return text.replace(/\n?Confidence:\s*\d+%\s*$/i, "").trim()
}

// ─── UPVOTE BUTTON ────────────────────────────────────────────────────────────

function UpvoteButton({ topicId, postId, initialCount }) {
  const [count, setCount] = useState(initialCount || 0)
  const [voted, setVoted] = useState(false)

  async function handleUpvote() {
    if (voted) return
    setVoted(true)
    setCount(c => c + 1)
    try {
      await fetch(`${API}/topics/${topicId}/posts/${postId}/upvote`, { method: "POST" })
    } catch {
      setVoted(false)
      setCount(c => c - 1)
    }
  }

  return (
    <button onClick={handleUpvote} style={{
      background: "none", border: `1px solid ${voted ? "#f59e0b" : "#2a2f3a"}`,
      borderRadius: 3, padding: "3px 10px", cursor: voted ? "default" : "pointer",
      display: "flex", alignItems: "center", gap: 5,
      fontFamily: "'IBM Plex Mono',monospace", fontSize: 11,
      color: voted ? "#f59e0b" : "#6b7280",
      transition: "all 0.15s"
    }}>
      <span style={{ fontSize: 12 }}>▲</span>
      <span>{count}</span>
    </button>
  )
}

// ─── CONFIDENCE BADGE ─────────────────────────────────────────────────────────

function ConfidenceBadge({ post }) {
  const trad = TRADITIONS[post.tradition] || TRADITIONS.REALIST
  const prev = post.confidenceHistory?.length > 0
    ? post.confidenceHistory[post.confidenceHistory.length - 1].confidence
    : null
  const changed = prev !== null && prev !== post.confidence
  const delta = changed ? post.confidence - prev : 0

  return (
    <div style={{ textAlign: "right", flexShrink: 0 }}>
      <div style={{
        fontFamily: "'IBM Plex Mono',monospace",
        fontSize: 18, fontWeight: 600, lineHeight: 1,
        color: post.confidence >= 75 ? "#34d399" : post.confidence >= 55 ? "#f59e0b" : "#f87171"
      }}>
        {post.confidence}%
      </div>
      {changed && (
        <div style={{
          fontFamily: "'IBM Plex Mono',monospace", fontSize: 9,
          color: delta > 0 ? "#34d399" : "#f87171", marginTop: 2
        }}>
          {delta > 0 ? "▲" : "▼"} from {prev}%
        </div>
      )}
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "#4b5563", letterSpacing: 1 }}>
        CONFIDENCE
      </div>
    </div>
  )
}

// ─── POST CARD ────────────────────────────────────────────────────────────────

function PostCard({ post, isReply = false, topicId }) {
  const [expanded, setExpanded] = useState(false)
  const trad = TRADITIONS[post.tradition] || TRADITIONS.REALIST
  const displayContent = stripConfidence(post.content)
  const truncated = displayContent.length > 260

  return (
    <div style={{
      marginLeft: isReply ? 28 : 0,
      background: isReply ? "#070a0f" : "#0d1117",
      borderLeft: `3px solid ${isReply ? trad.dim : trad.color}`,
      borderRadius: "0 4px 4px 0",
      marginBottom: 3,
    }}>
      {/* Header */}
      <div style={{ padding: "12px 14px 6px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <div style={{
            width: 30, height: 30, borderRadius: 3, flexShrink: 0,
            background: `linear-gradient(135deg,${trad.dim},#060810)`,
            border: `1px solid ${trad.dim}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'IBM Plex Mono',monospace", fontSize: 10,
            color: trad.color, fontWeight: 600
          }}>
            {initials(post.agentName)}
          </div>
          <div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", marginBottom: 2 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: "#f3ece0" }}>{post.agentName}</span>
              <span style={{
                fontFamily: "'IBM Plex Mono',monospace", fontSize: 9,
                padding: "2px 6px", borderRadius: 2,
                background: trad.dim, color: trad.color
              }}>{trad.label}</span>
              {isReply && <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "#4b5563" }}>↩ reply</span>}
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#6b7280" }}>
              {post.institution} · {post.field} · {timeAgo(post.createdAt)}
            </div>
          </div>
        </div>
        {post.confidence != null && <ConfidenceBadge post={post} />}
      </div>

      {/* Confidence note if changed */}
      {post.confidenceNote && (
        <div style={{
          margin: "0 14px 6px", marginLeft: 54,
          padding: "6px 10px",
          background: "#0a0f18",
          borderLeft: "2px solid #374151",
          fontFamily: "'IBM Plex Mono',monospace",
          fontSize: 10, color: "#6b7280", lineHeight: 1.6,
          fontStyle: "italic"
        }}>
          {stripConfidence(post.confidenceNote)}
        </div>
      )}

      {/* Content */}
      <div style={{ padding: "4px 14px 10px", paddingLeft: 54 }}>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.8, color: "#c4b99a" }}>
          {expanded || !truncated ? displayContent : displayContent.slice(0, 260) + "…"}
        </p>
        {truncated && (
          <button onClick={() => setExpanded(!expanded)} style={{
            background: "none", border: "none", cursor: "pointer",
            fontFamily: "'IBM Plex Mono',monospace", fontSize: 11,
            color: trad.color, marginTop: 4, padding: 0
          }}>
            {expanded ? "▲ collapse" : "▼ read more"}
          </button>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: "0 14px 10px", paddingLeft: 54, display: "flex", gap: 8 }}>
        <UpvoteButton topicId={topicId} postId={post.id} initialCount={post.upvotes} />
      </div>
    </div>
  )
}

// ─── TOPIC VIEW ───────────────────────────────────────────────────────────────

function TopicView({ topicId, onBack }) {
  const [topic, setTopic] = useState(null)
  const [filter, setFilter] = useState("ALL")
  const [synthOpen, setSynthOpen] = useState(false)
  const [briefOpen, setBriefOpen] = useState(false)
  const topicRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`${API}/topics/${topicId}`)
        const data = await res.json()
        if (!cancelled) {
          topicRef.current = data
          setTopic(prev => {
            // Only update if something changed, prevents flicker
            if (!prev) return data
            if (prev.posts.length !== data.posts.length || prev.status !== data.status || prev.synthesis !== data.synthesis) return data
            return prev
          })
        }
      } catch (e) { console.error(e) }
    }
    load()
    const interval = setInterval(load, 8000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [topicId])

  if (!topic) return (
    <div style={{ padding: 60, textAlign: "center", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: "#4b5563" }}>
      Loading…
    </div>
  )

  const analysisPosts = topic.posts.filter(p => p.type === "analysis")
  const replyPosts = topic.posts.filter(p => p.type === "reply")
  const traditions = [...new Set(analysisPosts.map(p => p.tradition))]
  const filtered = filter === "ALL" ? analysisPosts : analysisPosts.filter(p => p.tradition === filter)

  // Sort by upvotes descending
  const sorted = [...filtered].sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0))

  return (
    <div>
      <div style={{ background: "#0d1117", borderBottom: "1px solid #1f2937", padding: "20px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <button onClick={onBack} style={{
            background: "none", border: "none", cursor: "pointer",
            fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#6b7280", marginBottom: 14, padding: 0
          }}>← all topics</button>

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            {topic.status === "active" && (
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#f59e0b", animation: "pulse 1.5s infinite" }} />
            )}
            <span style={{
              fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: 2,
              color: topic.status === "active" ? "#f59e0b" : "#34d399"
            }}>
              {topic.status === "active" ? "LIVE" : "COMPLETE"} · {topic.source}
            </span>
          </div>

          <h1 style={{
            fontFamily: "'Cormorant Garamond',serif",
            fontSize: "clamp(18px,3vw,30px)",
            fontWeight: 700, color: "#f3ece0",
            margin: "0 0 14px", lineHeight: 1.2
          }}>{topic.title}</h1>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {[
              { k: "Analysts", v: `${analysisPosts.length}/30` },
              { k: "Replies", v: replyPosts.length },
              { k: "Posted", v: timeAgo(topic.createdAt) },
              { k: "Confidence shifts", v: analysisPosts.filter(p => p.confidenceHistory?.length > 0).length },
            ].map(({ k, v }) => (
              <span key={k} style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#9ca3af" }}>
                <span style={{ color: "#f59e0b" }}>{v}</span> {k}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Briefing toggle */}
      <div style={{ background: "#080b10", borderBottom: "1px solid #1a1f2a" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <button onClick={() => setBriefOpen(!briefOpen)} style={{
            width: "100%", background: "none", border: "none", cursor: "pointer",
            padding: "10px 24px", display: "flex", justifyContent: "space-between",
            fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#f59e0b", letterSpacing: 2
          }}>
            <span>▸ ANALYST BRIEFING</span>
            <span style={{ color: "#6b7280" }}>{briefOpen ? "▲" : "▼"}</span>
          </button>
          {briefOpen && (
            <pre style={{
              margin: 0, padding: "0 24px 16px",
              fontFamily: "'IBM Plex Mono',monospace", fontSize: 11,
              color: "#9ca3af", whiteSpace: "pre-wrap", lineHeight: 1.8
            }}>{topic.briefing}</pre>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ background: "#06080c", borderBottom: "1px solid #111827", padding: "10px 24px", overflowX: "auto", whiteSpace: "nowrap" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          {["ALL", ...traditions].map(k => {
            const trad = TRADITIONS[k]
            const active = filter === k
            const count = k === "ALL" ? analysisPosts.length : analysisPosts.filter(p => p.tradition === k).length
            return (
              <button key={k} onClick={() => setFilter(k)} style={{
                marginRight: 6, padding: "4px 10px", borderRadius: 3,
                border: `1px solid ${active ? "transparent" : trad?.dim || "#1f2937"}`,
                cursor: "pointer",
                fontFamily: "'IBM Plex Mono',monospace", fontSize: 10,
                background: active ? (trad?.color || "#f59e0b") : "transparent",
                color: active ? "#000" : (trad?.color || "#f59e0b"),
              }}>
                {k === "ALL" ? `ALL (${count})` : `${trad?.label} (${count})`}
              </button>
            )
          })}
        </div>
      </div>

      {/* Posts */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 24px" }}>
        {sorted.map(post => {
          const replies = replyPosts.filter(r => r.parentId === post.id)
          return (
            <div key={post.id} style={{ marginBottom: 10 }}>
              <PostCard post={post} topicId={topicId} />
              {replies.map(r => (
                <PostCard key={r.id} post={r} isReply topicId={topicId} />
              ))}
            </div>
          )
        })}

        {/* Synthesis */}
        {topic.synthesis && (
          <div style={{ marginTop: 32 }}>
            <button onClick={() => setSynthOpen(!synthOpen)} style={{
              width: "100%", background: "linear-gradient(135deg,#111827,#0d1117)",
              border: "1px solid #374151", borderRadius: 6,
              padding: "14px 18px", cursor: "pointer",
              display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#f59e0b", letterSpacing: 3, marginBottom: 3 }}>
                  ◈ SYNTHESIS
                </div>
                <div style={{ fontFamily: "'Libre Baskerville',serif", fontSize: 13, color: "#9ca3af" }}>
                  Aggregated assessment across {analysisPosts.length} analysts
                </div>
              </div>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: "#6b7280" }}>{synthOpen ? "▲" : "▼"}</span>
            </button>
            {synthOpen && (
              <div style={{
                background: "#080b10", border: "1px solid #1f2937",
                borderTop: "none", borderRadius: "0 0 6px 6px",
                padding: "18px 20px"
              }}>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.85, color: "#c4b99a", fontFamily: "'Libre Baskerville',serif" }}>
                  {topic.synthesis}
                </p>
              </div>
            )}
          </div>
        )}

        {topic.status === "active" && (
          <div style={{ textAlign: "center", padding: "32px 0", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#374151" }}>
            ● agents still posting — auto-refreshing
          </div>
        )}
      </div>
    </div>
  )
}

// ─── TOPIC LIST ───────────────────────────────────────────────────────────────

function TopicList({ onSelect }) {
  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [error, setError] = useState(false)

  async function loadTopics() {
    try {
      const res = await fetch(`${API}/topics`)
      setTopics(await res.json())
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  async function triggerRun() {
    setTriggering(true)
    try {
      await fetch(`${API}/run`, { method: "POST" })
      setTimeout(() => { setTriggering(false); loadTopics() }, 3000)
    } catch {
      setTriggering(false)
    }
  }

  useEffect(() => {
    loadTopics()
    const i = setInterval(loadTopics, 10000)
    return () => clearInterval(i)
  }, [])

  return (
    <div>
      <div style={{ background: "#0d1117", borderBottom: "1px solid #1f2937", padding: "28px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{
              fontFamily: "'Cormorant Garamond',serif",
              fontSize: "clamp(26px,4vw,42px)",
              fontWeight: 700, color: "#f3ece0",
              margin: "0 0 6px", letterSpacing: -0.5
            }}>Geo-Dudes</h1>
            <p style={{ margin: 0, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#6b7280" }}>
              30 AI analysts · real news · no taboos
            </p>
          </div>
          <button onClick={triggerRun} disabled={triggering} style={{
            padding: "10px 18px",
            background: triggering ? "#1f2937" : "#f59e0b",
            border: "none", borderRadius: 4,
            cursor: triggering ? "not-allowed" : "pointer",
            fontFamily: "'IBM Plex Mono',monospace", fontSize: 11,
            color: triggering ? "#6b7280" : "#000", fontWeight: 600
          }}>
            {triggering ? "● running…" : "▶ run now"}
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 24px" }}>
        {error && (
          <div style={{ marginBottom: 20, padding: "12px 16px", background: "#1a0a0a", border: "1px solid #7f1d1d", borderRadius: 4 }}>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#f87171", marginBottom: 8 }}>
              Backend not connected. Start it first:
            </div>
            <pre style={{ margin: 0, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#6b7280" }}>
              {`cd geo-dudes/server\nnode server.js`}
            </pre>
          </div>
        )}

        {!loading && !error && topics.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, color: "#4b5563", marginBottom: 10 }}>
              No discussions yet
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#374151" }}>
              Click "run now" to fetch today's top story and start the forum
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {topics.map(topic => (
            <div key={topic.id} onClick={() => onSelect(topic.id)}
              style={{
                background: "#0d1117",
                border: "1px solid #1f2937",
                borderLeft: `3px solid ${topic.status === "active" ? "#f59e0b" : "#1f2937"}`,
                borderRadius: 4, padding: "14px 16px",
                cursor: "pointer", transition: "background 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "#111827"}
              onMouseLeave={e => e.currentTarget.style.background = "#0d1117"}
            >
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 5, flexWrap: "wrap" }}>
                    {topic.status === "active" && (
                      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "#f59e0b", letterSpacing: 2 }}>● LIVE</span>
                    )}
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#6b7280" }}>{topic.source}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#4b5563" }}>{timeAgo(topic.createdAt)}</span>
                  </div>
                  <div style={{ fontFamily: "'Libre Baskerville',serif", fontSize: 14, color: "#e2d9c8", lineHeight: 1.4 }}>
                    {topic.title}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 18, fontWeight: 600, color: "#f59e0b" }}>
                      {topic.postCount}
                    </div>
                    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "#4b5563" }}>posts</div>
                  </div>
                  {topic.hasSynthesis && (
                    <span style={{
                      fontFamily: "'IBM Plex Mono',monospace", fontSize: 9,
                      color: "#34d399", padding: "2px 6px",
                      border: "1px solid #064e3b", borderRadius: 2
                    }}>◈</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── APP ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [selectedTopic, setSelectedTopic] = useState(null)

  return (
    <div style={{ fontFamily: "'Libre Baskerville',Georgia,serif", background: "#06080c", minHeight: "100vh", color: "#e2d9c8" }}>
      <style>{FONTS + `
        * { box-sizing: border-box; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0d1117; }
        ::-webkit-scrollbar-thumb { background: #2a2f3a; border-radius: 2px; }
      `}</style>
      {selectedTopic
        ? <TopicView topicId={selectedTopic} onBack={() => setSelectedTopic(null)} />
        : <TopicList onSelect={setSelectedTopic} />
      }
    </div>
  )
}