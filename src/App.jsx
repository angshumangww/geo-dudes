import { useState, useEffect } from "react"

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap');`

const API = "http://localhost:3001"

const TRADITIONS = {
  REALIST:        { label: "REALIST",       color: "#f59e0b" },
  LIBERAL:        { label: "LIBERAL",       color: "#38bdf8" },
  CONSTRUCTIVIST: { label: "CONSTRUCTIVIST",color: "#a78bfa" },
  AREA:           { label: "AREA",          color: "#4ade80" },
  MILITARY:       { label: "MILITARY",      color: "#f87171" },
  ECONOMIC:       { label: "ECON",          color: "#fb923c" },
  GLOBAL_SOUTH:   { label: "SOUTH",         color: "#22d3ee" },
  INTELLIGENCE:   { label: "INTEL",         color: "#e879f9" },
  GENERAL:        { label: "GENERAL",       color: "#4ade80" },
}

function getTradColor(tradition) {
  return (TRADITIONS[tradition] || TRADITIONS.GENERAL).color
}

function getTradLabel(tradition) {
  return (TRADITIONS[tradition] || TRADITIONS.GENERAL).label
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
  if (!text) return ""
  return text.replace(/\n?Confidence:\s*\d+%\s*$/i, "").trim()
}

// ─── PARSE SYNTHESIS ──────────────────────────────────────────────────────────

function parseSynthesis(text) {
  if (!text) return null
  const sections = {}
  const lines = text.split("\n")
  let current = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (trimmed.startsWith("CONSENSUS")) { current = "consensus"; sections.consensus = []; continue }
    if (trimmed.startsWith("KEY DISAGREEMENTS")) { current = "disagreements"; sections.disagreements = []; continue }
    if (trimmed.match(/^MOST LIKELY OUTCOME/)) { current = "outcome1"; sections.outcome1 = { prob: trimmed.match(/(\d+)%/)?.[1], items: [] }; continue }
    if (trimmed.match(/^SECOND SCENARIO/)) { current = "outcome2"; sections.outcome2 = { prob: trimmed.match(/(\d+)%/)?.[1], items: [] }; continue }
    if (trimmed.match(/^TAIL RISK/)) { current = "tail"; sections.tail = { prob: trimmed.match(/(\d+)%/)?.[1], items: [] }; continue }
    if (trimmed.startsWith("KEY VARIABLES")) { current = "variables"; sections.variables = []; continue }

    if (current && trimmed.startsWith("-")) {
      const content = trimmed.slice(1).trim()
      if (current === "consensus") sections.consensus.push(content)
      else if (current === "disagreements") sections.disagreements.push(content)
      else if (current === "outcome1") sections.outcome1.items.push(content)
      else if (current === "outcome2") sections.outcome2.items.push(content)
      else if (current === "tail") sections.tail.items.push(content)
      else if (current === "variables") sections.variables.push(content)
    }
  }

  return sections
}

// ─── SYNTHESIS RENDERER ───────────────────────────────────────────────────────

function SynthesisBlock({ text }) {
  const parsed = parseSynthesis(text)

  if (!parsed || Object.keys(parsed).length === 0) {
    return <p style={{ margin: 0, color: "#4ade80", fontSize: 12, lineHeight: 1.8, fontFamily: "JetBrains Mono, monospace" }}>{text}</p>
  }

  const SectionHeader = ({ label, color = "#4ade80" }) => (
    <div style={{ marginBottom: 8, marginTop: 16 }}>
      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color, letterSpacing: 3, fontWeight: 700 }}>
        [ {label} ]
      </span>
    </div>
  )

  const Bullet = ({ text, color = "#86efac" }) => (
    <div style={{ display: "flex", gap: 8, marginBottom: 5 }}>
      <span style={{ color: "#4ade80", fontFamily: "JetBrains Mono, monospace", fontSize: 11, flexShrink: 0 }}>→</span>
      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color, lineHeight: 1.7 }}>{text}</span>
    </div>
  )

  const OutcomeBlock = ({ data, label, color, probColor }) => {
    if (!data) return null
    return (
      <div style={{ marginBottom: 12, padding: "10px 12px", border: `1px solid ${color}22`, background: color + "08" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color, letterSpacing: 2 }}>{label}</span>
          {data.prob && (
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 16, fontWeight: 700, color: probColor || color }}>
              {data.prob}%
            </span>
          )}
        </div>
        {data.items?.map((item, i) => <Bullet key={i} text={item} color="#d1fae5" />)}
      </div>
    )
  }

  return (
    <div>
      {parsed.consensus?.length > 0 && (
        <div>
          <SectionHeader label="CONSENSUS" color="#4ade80" />
          {parsed.consensus.map((b, i) => <Bullet key={i} text={b} color="#86efac" />)}
        </div>
      )}
      {parsed.disagreements?.length > 0 && (
        <div>
          <SectionHeader label="KEY DISAGREEMENTS" color="#f59e0b" />
          {parsed.disagreements.map((b, i) => <Bullet key={i} text={b} color="#fcd34d" />)}
        </div>
      )}
      {(parsed.outcome1 || parsed.outcome2 || parsed.tail) && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#4ade80", letterSpacing: 3, marginBottom: 10 }}>
            [ PROBABILITY ASSESSMENT ]
          </div>
          <OutcomeBlock data={parsed.outcome1} label="MOST LIKELY" color="#4ade80" probColor="#4ade80" />
          <OutcomeBlock data={parsed.outcome2} label="SECOND SCENARIO" color="#f59e0b" probColor="#f59e0b" />
          <OutcomeBlock data={parsed.tail} label="TAIL RISK" color="#f87171" probColor="#f87171" />
        </div>
      )}
      {parsed.variables?.length > 0 && (
        <div>
          <SectionHeader label="KEY VARIABLES" color="#38bdf8" />
          {parsed.variables.map((v, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 5 }}>
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#38bdf8", flexShrink: 0 }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#93c5fd", lineHeight: 1.7 }}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
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
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      <button onClick={() => vote("up")} style={{
        background: "none", border: "none", cursor: voted ? "default" : "pointer",
        color: voted === "up" ? "#4ade80" : "#4a5568", fontSize: 12, padding: "0 2px",
        fontFamily: "JetBrains Mono, monospace"
      }}>▲</button>
      <span style={{
        fontSize: 10, minWidth: 16, textAlign: "center", fontFamily: "JetBrains Mono, monospace",
        color: score > 0 ? "#4ade80" : score < 0 ? "#f87171" : "#4a5568"
      }}>{score}</span>
      <button onClick={() => vote("down")} style={{
        background: "none", border: "none", cursor: voted ? "default" : "pointer",
        color: voted === "down" ? "#f87171" : "#4a5568", fontSize: 12, padding: "0 2px",
        fontFamily: "JetBrains Mono, monospace"
      }}>▼</button>
    </div>
  )
}

// ─── COMMENT NODE ─────────────────────────────────────────────────────────────

function CommentNode({ comment, allComments, topicId, depth = 0 }) {
  const [expanded, setExpanded] = useState(false)
  const accentColor = getTradColor(comment.tradition)
  const children = allComments.filter(c => c.parentId === comment.id)
  const displayContent = stripConfidence(comment.content)
  const truncated = displayContent.length > 320

  const prev = comment.confidenceHistory?.length > 0
    ? comment.confidenceHistory[comment.confidenceHistory.length - 1].confidence
    : null
  const confChanged = prev !== null && prev !== comment.confidence
  const confDelta = confChanged ? comment.confidence - prev : 0

  return (
    <div style={{ marginLeft: depth > 0 ? 20 : 0, marginBottom: 2 }}>
      <div style={{
        background: depth === 0 ? "#02030a" : "#010207",
        borderLeft: `2px solid ${depth === 0 ? accentColor : accentColor + "55"}`,
        padding: "9px 12px",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, flexWrap: "wrap", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <div style={{
              width: 22, height: 22, borderRadius: 2, flexShrink: 0,
              background: accentColor + "15",
              border: `1px solid ${accentColor}40`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 8, color: accentColor,
              fontFamily: "JetBrains Mono, monospace", fontWeight: 700
            }}>
              {initials(comment.agentName)}
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#d1fae5", fontFamily: "JetBrains Mono, monospace" }}>
              {comment.agentName}
            </span>
            <span style={{
              fontSize: 8, padding: "1px 5px", letterSpacing: 1,
              color: accentColor, border: `1px solid ${accentColor}44`,
              fontFamily: "JetBrains Mono, monospace"
            }}>
              {getTradLabel(comment.tradition)}
            </span>
            {comment.isRetroactive && (
              <span style={{ fontSize: 8, color: "#f59e0b", fontFamily: "JetBrains Mono, monospace", letterSpacing: 1 }}>
                [UPDATE]
              </span>
            )}
            {/* Institution — visible grey */}
            <span style={{ fontSize: 9, color: "#4a5568", fontFamily: "JetBrains Mono, monospace" }}>
              {comment.institution} · {timeAgo(comment.createdAt)}
            </span>
            {comment.confidence != null && (
              <span style={{
                fontFamily: "JetBrains Mono, monospace", fontSize: 10,
                color: comment.confidence >= 70 ? "#4ade80" : comment.confidence >= 50 ? "#f59e0b" : "#f87171"
              }}>
                {comment.confidence}%
                {confChanged && (
                  <span style={{ color: confDelta > 0 ? "#4ade80" : "#f87171", marginLeft: 3 }}>
                    ({confDelta > 0 ? "+" : ""}{confDelta})
                  </span>
                )}
              </span>
            )}
          </div>
          <VoteButtons topicId={topicId} commentId={comment.id} initialUp={comment.upvotes} initialDown={comment.downvotes} />
        </div>

        {/* Confidence note */}
        {comment.confidenceNote && (
          <div style={{
            marginBottom: 6, padding: "5px 8px",
            borderLeft: "1px solid #374151",
            fontFamily: "JetBrains Mono, monospace", fontSize: 10,
            color: "#4a5568", lineHeight: 1.6, fontStyle: "italic"
          }}>
            {stripConfidence(comment.confidenceNote)}
          </div>
        )}

        {/* Content */}
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.85, color: "#6ee7b7", fontFamily: "JetBrains Mono, monospace" }}>
          {expanded || !truncated ? displayContent : displayContent.slice(0, 320) + "…"}
        </p>
        {truncated && (
          <button onClick={() => setExpanded(!expanded)} style={{
            background: "none", border: "none", cursor: "pointer",
            fontFamily: "JetBrains Mono, monospace", fontSize: 10,
            color: accentColor + "99", marginTop: 4, padding: 0
          }}>
            {expanded ? "[ collapse ]" : "[ read more ]"}
          </button>
        )}
      </div>

      {/* Children */}
      {children.length > 0 && (
        <div style={{ borderLeft: "1px solid #111827", marginLeft: 8 }}>
          {children
            .sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes))
            .map(child => (
              <CommentNode key={child.id} comment={child} allComments={allComments} topicId={topicId} depth={depth + 1} />
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
  const [sort, setSort] = useState("top")

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`${API}/topics/${topicId}`)
        const data = await res.json()
        if (!cancelled) {
          setTopic(prev => {
            if (!prev) return data
            if (prev.comments.length !== data.comments.length || prev.status !== data.status || prev.synthesis !== data.synthesis) return data
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
    <div style={{ padding: 60, textAlign: "center", fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "#4a5568" }}>
      LOADING...
    </div>
  )

  const opColor = getTradColor(topic.opTradition)
  const topLevelComments = topic.comments.filter(c => c.parentId === null)
  const traditions = [...new Set(topLevelComments.map(c => c.tradition))]

  let filtered = filter === "ALL" ? topLevelComments : topLevelComments.filter(c => c.tradition === filter)
  filtered = sort === "top"
    ? [...filtered].sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes))
    : [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  return (
    <div>
      {/* Header */}
      <div style={{ borderBottom: "1px solid #111827", padding: "16px 20px", background: "#000" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <button onClick={onBack} style={{
            background: "none", border: "none", cursor: "pointer",
            fontFamily: "JetBrains Mono, monospace", fontSize: 10,
            color: "#4a5568", marginBottom: 12, padding: 0, letterSpacing: 1
          }}>← BACK</button>

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            {topic.status === "active" && (
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#f59e0b", letterSpacing: 2, animation: "blink 1.5s infinite" }}>
                ● LIVE
              </span>
            )}
            {topic.isGeo && (
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#4ade80", letterSpacing: 2 }}>GEO</span>
            )}
            {/* Source in white, time in green */}
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#ffffff", letterSpacing: 1 }}>
              {topic.source?.toUpperCase()}
            </span>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#4ade80", letterSpacing: 1 }}>
              · {timeAgo(topic.createdAt).toUpperCase()}
            </span>
          </div>

          <h1 style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: "clamp(13px,2vw,18px)",
            fontWeight: 600, color: "#d1fae5",
            margin: "0 0 14px", lineHeight: 1.4, letterSpacing: 0.5
          }}>{topic.title}</h1>

          {/* OP Post */}
          <div style={{
            background: "#000",
            border: `1px solid ${opColor}33`,
            borderLeft: `3px solid ${opColor}`,
            padding: "12px 14px", marginBottom: 12
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
              <div style={{
                width: 24, height: 24, borderRadius: 2,
                background: opColor + "15", border: `1px solid ${opColor}40`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 8, color: opColor, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, flexShrink: 0
              }}>
                {initials(topic.opAgentName)}
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#d1fae5", fontFamily: "JetBrains Mono, monospace" }}>
                {topic.opAgentName}
              </span>
              <span style={{ fontSize: 8, padding: "1px 5px", color: opColor, border: `1px solid ${opColor}44`, fontFamily: "JetBrains Mono, monospace", letterSpacing: 1 }}>
                OP
              </span>
              {/* Institution in visible grey */}
              <span style={{ fontSize: 9, color: "#4a5568", fontFamily: "JetBrains Mono, monospace" }}>
                {topic.opInstitution}
              </span>
              {topic.opConfidence != null && (
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#4ade80" }}>
                  {topic.opConfidence}%
                </span>
              )}
            </div>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.85, color: "#6ee7b7", fontFamily: "JetBrains Mono, monospace" }}>
              {stripConfidence(topic.opPost)}
            </p>
          </div>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {[
              { k: "COMMENTS", v: topic.comments.length },
              { k: "ANALYSTS", v: new Set(topic.comments.map(c => c.agentId)).size },
              { k: "SHIFTS", v: topLevelComments.filter(c => c.confidenceHistory?.length > 0).length },
            ].map(({ k, v }) => (
              <span key={k} style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#4a5568", letterSpacing: 1 }}>
                <span style={{ color: "#4ade80" }}>{v}</span> {k}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Briefing */}
      <div style={{ borderBottom: "1px solid #111827" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <button onClick={() => setBriefOpen(!briefOpen)} style={{
            width: "100%", background: "none", border: "none", cursor: "pointer",
            padding: "8px 20px", display: "flex", justifyContent: "space-between",
            fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#4ade80", letterSpacing: 2
          }}>
            <span>[ INTEL BRIEFING ]</span>
            <span>{briefOpen ? "▲" : "▼"}</span>
          </button>
          {briefOpen && (
            <div style={{ padding: "0 20px 14px" }}>
              <p style={{ margin: 0, fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#4a5568", lineHeight: 1.9 }}>
                {topic.briefing}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Filter + sort */}
      <div style={{ borderBottom: "1px solid #111827", padding: "7px 20px", overflowX: "auto", whiteSpace: "nowrap" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {["ALL", ...traditions].map(k => {
              const col = k === "ALL" ? "#4ade80" : getTradColor(k)
              const active = filter === k
              const count = k === "ALL" ? topLevelComments.length : topLevelComments.filter(c => c.tradition === k).length
              return (
                <button key={k} onClick={() => setFilter(k)} style={{
                  padding: "2px 8px", border: `1px solid ${active ? col : col + "44"}`,
                  cursor: "pointer", fontFamily: "JetBrains Mono, monospace", fontSize: 8,
                  background: active ? col + "22" : "transparent",
                  color: active ? col : col + "88", letterSpacing: 1
                }}>
                  {k === "ALL" ? `ALL [${count}]` : `${getTradLabel(k)} [${count}]`}
                </button>
              )
            })}
          </div>
          <div style={{ display: "flex", gap: 3 }}>
            {[["top", "▲ TOP"], ["new", "⏱ NEW"]].map(([s, label]) => (
              <button key={s} onClick={() => setSort(s)} style={{
                padding: "2px 8px", border: "none", cursor: "pointer",
                fontFamily: "JetBrains Mono, monospace", fontSize: 8,
                background: sort === s ? "#4ade8022" : "transparent",
                color: sort === s ? "#4ade80" : "#4a5568", letterSpacing: 1
              }}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Comments */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "12px 20px" }}>
        {filtered.map(comment => (
          <CommentNode key={comment.id} comment={comment} allComments={topic.comments} topicId={topicId} depth={0} />
        ))}

        {/* Synthesis */}
        {topic.synthesis && (
          <div style={{ marginTop: 24, border: "1px solid #4ade8033" }}>
            <button onClick={() => setSynthOpen(!synthOpen)} style={{
              width: "100%", background: "#010a03", border: "none",
              padding: "12px 16px", cursor: "pointer",
              display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#4ade80", letterSpacing: 3, marginBottom: 2 }}>
                  ◈ SYNTHESIS OUTPUT
                </div>
                <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#4a5568" }}>
                  Aggregated assessment · {topLevelComments.length} analysts
                </div>
              </div>
              <span style={{ fontFamily: "JetBrains Mono, monospace", color: "#4ade80", fontSize: 12 }}>{synthOpen ? "▲" : "▼"}</span>
            </button>
            {synthOpen && (
              <div style={{ background: "#010a03", padding: "16px 18px", borderTop: "1px solid #4ade8022" }}>
                <SynthesisBlock text={topic.synthesis} />
              </div>
            )}
          </div>
        )}

        {topic.status === "active" && (
          <div style={{ textAlign: "center", padding: "24px 0", fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#4ade80", letterSpacing: 2 }}>
            ● DISCUSSION IN PROGRESS — AUTO-REFRESH 8s
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

  useEffect(() => {
    const t = setInterval(() => {}, 1000)
    return () => clearInterval(t)
  }, [])

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
    if (!window.confirm("Delete all data and start fresh?")) return
    setClearing(true)
    await fetch(`${API}/data`, { method: "DELETE" })
    setTopics([])
    setClearing(false)
  }

  useEffect(() => { loadTopics(); const i = setInterval(loadTopics, 10000); return () => clearInterval(i) }, [])

  const now = new Date()
  const timeStr = now.toISOString().replace("T", " ").slice(0, 19) + " UTC"

  return (
    <div>
      {/* Top bar */}
      <div style={{ borderBottom: "1px solid #111827", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Time in green */}
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#4ade80", letterSpacing: 2 }}>
            {timeStr}
          </span>
          {!error && <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#4ade80", letterSpacing: 2, animation: "blink 2s infinite" }}>● ONLINE</span>}
          {error && <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#f87171", letterSpacing: 2 }}>● BACKEND OFFLINE</span>}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={clearData} disabled={clearing} style={{
            padding: "4px 10px", background: "transparent",
            border: "1px solid #374151", cursor: "pointer",
            fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#4a5568", letterSpacing: 1
          }}>
            {clearing ? "CLEARING..." : "CLEAR"}
          </button>
          <button onClick={triggerRun} disabled={triggering} style={{
            padding: "4px 12px",
            background: triggering ? "transparent" : "#4ade8022",
            border: `1px solid ${triggering ? "#374151" : "#4ade80"}`,
            cursor: triggering ? "not-allowed" : "pointer",
            fontFamily: "JetBrains Mono, monospace", fontSize: 9,
            color: triggering ? "#4a5568" : "#4ade80", letterSpacing: 1
          }}>
            {triggering ? "RUNNING..." : "▶ RUN CYCLE"}
          </button>
        </div>
      </div>

      {/* Masthead */}
      <div style={{ padding: "24px 20px 16px", borderBottom: "1px solid #111827" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
            <h1 style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: "clamp(20px,4vw,32px)",
              fontWeight: 700, color: "#4ade80",
              margin: 0, letterSpacing: 2
            }}>GEO-DUDES</h1>
            {/* Tagline in green */}
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#4ade80", letterSpacing: 1 }}>
              v2.0 // THE WORLD DISCUSSED
            </span>
          </div>
          {/* Subtitle in green */}
          <p style={{ margin: 0, fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#4ade80", letterSpacing: 2 }}>
            60 AI ANALYSTS // REAL NEWS // {topics.length} ACTIVE DISCUSSIONS
          </p>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div style={{ maxWidth: 900, margin: "16px auto", padding: "0 20px" }}>
          <div style={{ padding: "12px 14px", border: "1px solid #f8717144" }}>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#f87171", marginBottom: 6, letterSpacing: 1 }}>
              ERROR: BACKEND NOT CONNECTED
            </div>
            <pre style={{ margin: 0, fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#4a5568" }}>
              {`cd geo-dudes/server\nnode server.js`}
            </pre>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && topics.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "#4a5568", marginBottom: 8, letterSpacing: 2 }}>
            NO DATA
          </div>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#374151", letterSpacing: 1 }}>
            CLICK RUN CYCLE TO FETCH FIRST STORY
          </div>
        </div>
      )}

      {/* Topic list */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "12px 20px" }}>
        {topics.map((topic, idx) => {
          const opColor = getTradColor(topic.opTradition)
          return (
            <div key={topic.id} onClick={() => onSelect(topic.id)}
              style={{
                borderBottom: "1px solid #111827",
                padding: "10px 12px",
                cursor: "pointer",
                borderLeft: `2px solid ${topic.status === "active" ? "#f59e0b" : "#1f2937"}`,
                transition: "background 0.1s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "#02030a"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Meta row */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 5, flexWrap: "wrap" }}>
                    {/* Index number */}
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 8, color: "#374151" }}>
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    {topic.status === "active" && (
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 8, color: "#f59e0b", letterSpacing: 2 }}>● LIVE</span>
                    )}
                    {topic.isGeo && (
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 8, color: "#4ade80", letterSpacing: 1, border: "1px solid #4ade8033", padding: "0 3px" }}>GEO</span>
                    )}
                    <span style={{
                      fontSize: 8, padding: "0 4px", letterSpacing: 1,
                      color: opColor, border: `1px solid ${opColor}33`,
                      fontFamily: "JetBrains Mono, monospace"
                    }}>
                      {topic.opAgentName?.split(" ").slice(-1)[0]?.toUpperCase()}
                    </span>
                    {/* Source in white */}
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 8, color: "#ffffff" }}>
                      {topic.source?.toUpperCase()}
                    </span>
                    {/* Time in green */}
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 8, color: "#4ade80" }}>
                      · {timeAgo(topic.createdAt).toUpperCase()}
                    </span>
                    {topic.hasRetroactive && (
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 8, color: "#f59e0b", letterSpacing: 1 }}>
                        [NEW UPDATES]
                      </span>
                    )}
                  </div>
                  {/* Title */}
                  <div style={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: "clamp(11px,1.5vw,13px)",
                    color: "#a7f3d0", lineHeight: 1.5, fontWeight: 500
                  }}>
                    {topic.title}
                  </div>
                </div>
                {/* Stats */}
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 16, fontWeight: 700, color: "#4ade80" }}>
                      {topic.commentCount}
                    </div>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 7, color: "#4a5568", letterSpacing: 1 }}>COMMENTS</div>
                  </div>
                  {topic.hasSynthesis && (
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#4ade80", border: "1px solid #4ade8033", padding: "2px 5px" }}>◈</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── APP ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [selectedTopic, setSelectedTopic] = useState(null)

  return (
    <div style={{
      fontFamily: "JetBrains Mono, monospace",
      background: "#000000",
      minHeight: "100vh",
      color: "#4ade80"
    }}>
      <style>{FONTS + `
        * { box-sizing: border-box; }
        body { background: #000; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: #000; }
        ::-webkit-scrollbar-thumb { background: #1f2937; }
        ::selection { background: #4ade8033; }
      `}</style>
      {selectedTopic
        ? <TopicView topicId={selectedTopic} onBack={() => setSelectedTopic(null)} />
        : <TopicList onSelect={setSelectedTopic} />
      }
    </div>
  )
}