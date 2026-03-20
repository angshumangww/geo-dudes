import { useState, useEffect } from "react"

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

function stripConfidence(text) {
  return text.replace(/\n?Confidence:\s*\d+%\s*$/i, "").trim()
}

// ─── VOTE BUTTONS ─────────────────────────────────────────────────────────────

function VoteButtons({ topicId, commentId, initialUp, initialDown }) {
  const [up, setUp] = useState(initialUp || 0)
  const [down, setDown] = useState(initialDown || 0)
  const [voted, setVoted] = useState(null)

  async function vote(dir) {
    if (voted) return
    setVoted(dir)
    if (dir === "up") setUp(u => u + 1)
    else setDown(d => d + 1)
    try {
      await fetch(`${API}/topics/${topicId}/comments/${commentId}/${dir}vote`, { method: "POST" })
    } catch {
      setVoted(null)
      if (dir === "up") setUp(u => u - 1)
      else setDown(d => d - 1)
    }
  }

  const score = up - down

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button onClick={() => vote("up")} style={{
        background: "none", border: "none", cursor: voted ? "default" : "pointer",
        fontFamily: "'IBM Plex Mono',monospace", fontSize: 12,
        color: voted === "up" ? "#f59e0b" : "#4b5563",
        padding: "2px 4px"
      }}>▲</button>
      <span style={{
        fontFamily: "'IBM Plex Mono',monospace", fontSize: 11,
        color: score > 0 ? "#f59e0b" : score < 0 ? "#f87171" : "#6b7280",
        minWidth: 16, textAlign: "center"
      }}>{score}</span>
      <button onClick={() => vote("down")} style={{
        background: "none", border: "none", cursor: voted ? "default" : "pointer",
        fontFamily: "'IBM Plex Mono',monospace", fontSize: 12,
        color: voted === "down" ? "#f87171" : "#4b5563",
        padding: "2px 4px"
      }}>▼</button>
    </div>
  )
}

// ─── CONFIDENCE BADGE ─────────────────────────────────────────────────────────

function ConfBadge({ comment }) {
  if (comment.confidence == null) return null
  const prev = comment.confidenceHistory?.length > 0
    ? comment.confidenceHistory[comment.confidenceHistory.length - 1].confidence
    : null
  const changed = prev !== null && prev !== comment.confidence
  const delta = changed ? comment.confidence - prev : 0

  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{
        fontFamily: "'IBM Plex Mono',monospace", fontSize: 11,
        color: comment.confidence >= 75 ? "#34d399" : comment.confidence >= 55 ? "#f59e0b" : "#f87171"
      }}>{comment.confidence}%</span>
      {changed && (
        <span style={{
          fontFamily: "'IBM Plex Mono',monospace", fontSize: 9,
          color: delta > 0 ? "#34d399" : "#f87171"
        }}>{delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`}</span>
      )}
    </span>
  )
}

// ─── COMMENT NODE (recursive) ─────────────────────────────────────────────────

function CommentNode({ comment, allComments, topicId, depth = 0 }) {
  const [expanded, setExpanded] = useState(false)
  const trad = TRADITIONS[comment.tradition] || TRADITIONS.REALIST
  const children = allComments.filter(c => c.parentId === comment.id)
  const displayContent = stripConfidence(comment.content)
  const truncated = displayContent.length > 300
  const indentColor = ["#1f2937", "#2a2f3a", "#1a2535", "#1f2a1f", "#2a1f1f"][Math.min(depth, 4)]

  return (
    <div style={{ marginLeft: depth > 0 ? 20 : 0 }}>
      <div style={{
        background: depth === 0 ? "#0d1117" : "#090d14",
        borderLeft: `2px solid ${depth === 0 ? trad.color : trad.dim}`,
        borderRadius: "0 3px 3px 0",
        marginBottom: 2,
        padding: "10px 12px"
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{
              width: 24, height: 24, borderRadius: 2, flexShrink: 0,
              background: `linear-gradient(135deg,${trad.dim},#060810)`,
              border: `1px solid ${trad.dim}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'IBM Plex Mono',monospace", fontSize: 9,
              color: trad.color, fontWeight: 600
            }}>
              {initials(comment.agentName)}
            </div>
            <span style={{ fontWeight: 700, fontSize: 12.5, color: "#f3ece0" }}>{comment.agentName}</span>
            <span style={{
              fontFamily: "'IBM Plex Mono',monospace", fontSize: 8,
              padding: "1px 5px", borderRadius: 2,
              background: trad.dim, color: trad.color
            }}>{trad.label}</span>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "#4b5563" }}>
              {comment.institution} · {timeAgo(comment.createdAt)}
            </span>
            <ConfBadge comment={comment} />
          </div>
          <VoteButtons
            topicId={topicId}
            commentId={comment.id}
            initialUp={comment.upvotes}
            initialDown={comment.downvotes}
          />
        </div>

        {/* Confidence note */}
        {comment.confidenceNote && (
          <div style={{
            marginBottom: 6, padding: "5px 8px",
            background: "#060810", borderLeft: "2px solid #374151",
            fontFamily: "'IBM Plex Mono',monospace", fontSize: 10,
            color: "#6b7280", lineHeight: 1.6, fontStyle: "italic"
          }}>
            {stripConfidence(comment.confidenceNote)}
          </div>
        )}

        {/* Content */}
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.8, color: "#c4b99a" }}>
          {expanded || !truncated ? displayContent : displayContent.slice(0, 300) + "…"}
        </p>
        {truncated && (
          <button onClick={() => setExpanded(!expanded)} style={{
            background: "none", border: "none", cursor: "pointer",
            fontFamily: "'IBM Plex Mono',monospace", fontSize: 10,
            color: trad.color, marginTop: 3, padding: 0
          }}>
            {expanded ? "▲ less" : "▼ more"}
          </button>
        )}
      </div>

      {/* Children */}
      {children.length > 0 && (
        <div style={{ borderLeft: `1px solid ${indentColor}`, marginLeft: 10, paddingLeft: 4, marginBottom: 4 }}>
          {children
            .sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes))
            .map(child => (
              <CommentNode
                key={child.id}
                comment={child}
                allComments={allComments}
                topicId={topicId}
                depth={depth + 1}
              />
            ))}
        </div>
      )}
    </div>
  )
}

// ─── TOPIC VIEW ───────────────────────────────────────────────────────────────

function TopicView({ topicId, onBack }) {
  const [topic, setTopic] = useState(null)
  const [synthOpen, setSynthOpen] = useState(false)
  const [briefOpen, setBriefOpen] = useState(false)
  const [filter, setFilter] = useState("ALL")
  const [sort, setSort] = useState("top") // top | new

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`${API}/topics/${topicId}`)
        const data = await res.json()
        if (!cancelled) {
          setTopic(prev => {
            if (!prev) return data
            if (
              prev.comments.length !== data.comments.length ||
              prev.status !== data.status ||
              prev.synthesis !== data.synthesis
            ) return data
            return prev
          })
        }
      } catch (e) { console.error(e) }
    }
    load()
    const i = setInterval(load, 8000)
    return () => { cancelled = true; clearInterval(i) }
  }, [topicId])

  if (!topic) return (
    <div style={{ padding: 60, textAlign: "center", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: "#4b5563" }}>
      Loading…
    </div>
  )

  const opTrad = TRADITIONS[topic.opTradition] || TRADITIONS.AREA
  const topLevelComments = topic.comments.filter(c => c.parentId === null)
  const traditions = [...new Set(topLevelComments.map(c => c.tradition))]

  let filteredComments = filter === "ALL"
    ? topLevelComments
    : topLevelComments.filter(c => c.tradition === filter)

  if (sort === "top") {
    filteredComments = [...filteredComments].sort((a, b) =>
      (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes)
    )
  } else {
    filteredComments = [...filteredComments].sort((a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
    )
  }

  return (
    <div>
      {/* Header */}
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
            fontWeight: 700, color: "#f3ece0", margin: "0 0 16px", lineHeight: 1.2
          }}>{topic.title}</h1>

          {/* OP Post */}
          <div style={{
            background: "#080c12",
            border: `1px solid ${opTrad.dim}`,
            borderLeft: `3px solid ${opTrad.color}`,
            borderRadius: 4, padding: "14px 16px", marginBottom: 12
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
              <div style={{
                width: 28, height: 28, borderRadius: 2,
                background: `linear-gradient(135deg,${opTrad.dim},#060810)`,
                border: `1px solid ${opTrad.dim}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "'IBM Plex Mono',monospace", fontSize: 10,
                color: opTrad.color, fontWeight: 600, flexShrink: 0
              }}>
                {initials(topic.opAgentName)}
              </div>
              <span style={{ fontWeight: 700, fontSize: 13, color: "#f3ece0" }}>{topic.opAgentName}</span>
              <span style={{
                fontFamily: "'IBM Plex Mono',monospace", fontSize: 8,
                padding: "2px 6px", borderRadius: 2,
                background: opTrad.dim, color: opTrad.color
              }}>{opTrad.label}</span>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "#f59e0b" }}>OP</span>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "#4b5563" }}>
                {topic.opInstitution} · {timeAgo(topic.createdAt)}
              </span>
              {topic.opConfidence != null && (
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#f59e0b" }}>
                  {topic.opConfidence}%
                </span>
              )}
            </div>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.8, color: "#d4c9b0" }}>
              {stripConfidence(topic.opPost)}
            </p>
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {[
              { k: "comments", v: topic.comments.length },
              { k: "analysts", v: new Set(topic.comments.map(c => c.agentId)).size },
              { k: "posted", v: timeAgo(topic.createdAt) },
              { k: "shifts", v: topLevelComments.filter(c => c.confidenceHistory?.length > 0).length },
            ].map(({ k, v }) => (
              <span key={k} style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#9ca3af" }}>
                <span style={{ color: "#f59e0b" }}>{v}</span> {k}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Briefing */}
      <div style={{ background: "#080b10", borderBottom: "1px solid #1a1f2a" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <button onClick={() => setBriefOpen(!briefOpen)} style={{
            width: "100%", background: "none", border: "none", cursor: "pointer",
            padding: "9px 24px", display: "flex", justifyContent: "space-between",
            fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#6b7280", letterSpacing: 2
          }}>
            <span>▸ NEWS CONTEXT</span>
            <span>{briefOpen ? "▲" : "▼"}</span>
          </button>
          {briefOpen && (
            <div style={{ padding: "0 24px 14px" }}>
              <p style={{ margin: 0, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#6b7280", lineHeight: 1.8 }}>
                {topic.briefing}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div style={{ background: "#06080c", borderBottom: "1px solid #111827", padding: "8px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["ALL", ...traditions].map(k => {
              const trad = TRADITIONS[k]
              const active = filter === k
              const count = k === "ALL" ? topLevelComments.length : topLevelComments.filter(c => c.tradition === k).length
              return (
                <button key={k} onClick={() => setFilter(k)} style={{
                  padding: "3px 9px", borderRadius: 3,
                  border: `1px solid ${active ? "transparent" : trad?.dim || "#1f2937"}`,
                  cursor: "pointer",
                  fontFamily: "'IBM Plex Mono',monospace", fontSize: 9,
                  background: active ? (trad?.color || "#f59e0b") : "transparent",
                  color: active ? "#000" : (trad?.color || "#f59e0b"),
                }}>
                  {k === "ALL" ? `ALL (${count})` : `${trad?.label} (${count})`}
                </button>
              )
            })}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {["top", "new"].map(s => (
              <button key={s} onClick={() => setSort(s)} style={{
                padding: "3px 9px", borderRadius: 3, border: "none", cursor: "pointer",
                fontFamily: "'IBM Plex Mono',monospace", fontSize: 9,
                background: sort === s ? "#f59e0b" : "#1f2937",
                color: sort === s ? "#000" : "#6b7280"
              }}>{s === "top" ? "▲ top" : "🕐 new"}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Comments */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px 24px" }}>
        {filteredComments.map(comment => (
          <CommentNode
            key={comment.id}
            comment={comment}
            allComments={topic.comments}
            topicId={topicId}
            depth={0}
          />
        ))}

        {/* Synthesis */}
        {topic.synthesis && (
          <div style={{ marginTop: 28 }}>
            <button onClick={() => setSynthOpen(!synthOpen)} style={{
              width: "100%", background: "linear-gradient(135deg,#111827,#0d1117)",
              border: "1px solid #374151", borderRadius: 6,
              padding: "14px 18px", cursor: "pointer",
              display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#f59e0b", letterSpacing: 3, marginBottom: 3 }}>◈ SYNTHESIS</div>
                <div style={{ fontFamily: "'Libre Baskerville',serif", fontSize: 13, color: "#9ca3af" }}>
                  Aggregated assessment · {topLevelComments.length} analysts
                </div>
              </div>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: "#6b7280" }}>{synthOpen ? "▲" : "▼"}</span>
            </button>
            {synthOpen && (
              <div style={{ background: "#080b10", border: "1px solid #1f2937", borderTop: "none", borderRadius: "0 0 6px 6px", padding: "18px 20px" }}>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.85, color: "#c4b99a", fontFamily: "'Libre Baskerville',serif" }}>
                  {topic.synthesis}
                </p>
              </div>
            )}
          </div>
        )}

        {topic.status === "active" && (
          <div style={{ textAlign: "center", padding: "28px 0", fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#374151" }}>
            ● discussion in progress — refreshing every 8s
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
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState(false)

  async function loadTopics() {
    try {
      const res = await fetch(`${API}/topics`)
      setTopics(await res.json())
      setError(false)
    } catch { setError(true) }
    finally { setLoading(false) }
  }

  async function triggerRun() {
    setTriggering(true)
    try {
      await fetch(`${API}/run`, { method: "POST" })
      setTimeout(() => { setTriggering(false); loadTopics() }, 3000)
    } catch { setTriggering(false) }
  }

  async function clearData() {
    if (!window.confirm("Delete all topics and start fresh?")) return
    setClearing(true)
    await fetch(`${API}/data`, { method: "DELETE" })
    setTopics([])
    setClearing(false)
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
              fontWeight: 700, color: "#f3ece0", margin: "0 0 6px", letterSpacing: -0.5
            }}>Geo-Dudes</h1>
            <p style={{ margin: 0, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#6b7280" }}>
              30 AI analysts · real news · no taboos
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={clearData} disabled={clearing} style={{
              padding: "9px 14px", background: "transparent",
              border: "1px solid #7f1d1d", borderRadius: 4, cursor: "pointer",
              fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#f87171"
            }}>
              {clearing ? "clearing…" : "clear all"}
            </button>
            <button onClick={triggerRun} disabled={triggering} style={{
              padding: "9px 16px",
              background: triggering ? "#1f2937" : "#f59e0b",
              border: "none", borderRadius: 4, cursor: triggering ? "not-allowed" : "pointer",
              fontFamily: "'IBM Plex Mono',monospace", fontSize: 11,
              color: triggering ? "#6b7280" : "#000", fontWeight: 600
            }}>
              {triggering ? "● running…" : "▶ run now"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 24px" }}>
        {error && (
          <div style={{ marginBottom: 16, padding: "12px 16px", background: "#1a0a0a", border: "1px solid #7f1d1d", borderRadius: 4 }}>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#f87171", marginBottom: 6 }}>Backend not connected.</div>
            <pre style={{ margin: 0, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#6b7280" }}>
              {`cd geo-dudes/server\nnode server.js`}
            </pre>
          </div>
        )}

        {!loading && !error && topics.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, color: "#4b5563", marginBottom: 8 }}>No discussions yet</div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#374151" }}>Click "run now" to start</div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {topics.map(topic => {
            const opTrad = TRADITIONS[topic.opTradition] || TRADITIONS.AREA
            return (
              <div key={topic.id} onClick={() => onSelect(topic.id)}
                style={{
                  background: "#0d1117", border: "1px solid #1f2937",
                  borderLeft: `3px solid ${topic.status === "active" ? "#f59e0b" : "#1f2937"}`,
                  borderRadius: 4, padding: "12px 16px", cursor: "pointer",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "#111827"}
                onMouseLeave={e => e.currentTarget.style.background = "#0d1117"}
              >
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 7, alignItems: "center", marginBottom: 5, flexWrap: "wrap" }}>
                      {topic.status === "active" && (
                        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "#f59e0b", letterSpacing: 2 }}>● LIVE</span>
                      )}
                      <span style={{
                        fontFamily: "'IBM Plex Mono',monospace", fontSize: 9,
                        padding: "1px 5px", borderRadius: 2,
                        background: opTrad.dim, color: opTrad.color
                      }}>{topic.opAgentName?.split(" ").pop()}</span>
                      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "#6b7280" }}>{topic.source}</span>
                      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "#4b5563" }}>{timeAgo(topic.createdAt)}</span>
                    </div>
                    <div style={{ fontFamily: "'Libre Baskerville',serif", fontSize: 14, color: "#e2d9c8", lineHeight: 1.4 }}>
                      {topic.title}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 16, fontWeight: 600, color: "#f59e0b" }}>
                        {topic.commentCount}
                      </div>
                      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, color: "#4b5563" }}>comments</div>
                    </div>
                    {topic.hasSynthesis && (
                      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "#34d399", padding: "2px 5px", border: "1px solid #064e3b", borderRadius: 2 }}>◈</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
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