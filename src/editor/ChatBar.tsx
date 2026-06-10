import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { DeckJson } from "../schema.js";
import { chatStream, loadDeck, saveDeck, stopChat, type ChatSelection } from "./api.js";

type Line = { role: "you" | "claude" | "error"; text: string };

const PRESETS = [
  "Make this look more polished and professional",
  "Make the spacing and vertical rhythm even",
  "Align everything to a consistent left margin",
];

const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

// Persist the transcript so it survives page refreshes (the server's warm Claude process keeps the
// conversation context across refreshes too, so the session stays continuous). Keyed per origin —
// one dev server serves one deck, so a single key is fine.
const LOG_KEY = "remotion-deck:chatlog";
const LOG_CAP = 300;
const loadLog = (): Line[] => {
  try { const v = JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
};
const saveLog = (log: Line[]) => {
  try { localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-LOG_CAP))); } catch { /* storage full / unavailable */ }
};

/**
 * Terminal-style chat: a real, conversational Claude Code session scoped to this deck. You type at
 * the ❯ prompt, Claude answers (and edits the deck file directly when asked); replies stream in
 * live like a CLI session. Back-and-forth context is kept by the warm server process.
 */
export const ChatBar = ({ deck, onDeck, selection, height }: { deck: DeckJson; onDeck: (d: DeckJson) => void; selection: ChatSelection; height: number }) => {
  const [msg, setMsg] = useState("");
  const [log, setLog] = useState<Line[]>(loadLog);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<"deck" | "slide">("slide");
  const [tick, setTick] = useState(0);
  const [queue, setQueue] = useState<string[]>([]); // messages queued while a turn is in flight
  const queueRef = useRef<string[]>([]);
  const setQ = (next: string[] | ((q: string[]) => string[])) =>
    setQueue((q) => { const v = typeof next === "function" ? next(q) : next; queueRef.current = v; return v; });
  const [history, setHistory] = useState<string[]>(() => loadLog().filter((l) => l.role === "you").map((l) => l.text));
  const histIdx = useRef<number | null>(null);
  const startedAt = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setTick((n) => n + 1), 120);
    return () => clearInterval(t);
  }, [busy]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [log, streaming]);
  useEffect(() => { saveLog(log); }, [log]); // persist transcript across refreshes

  // Run one turn (abortable). On natural completion, auto-advance the queue; a stop skips that.
  const submit = async (m: string) => {
    setLog((l) => [...l, { role: "you", text: m }]);
    setBusy(true);
    setStreaming("");
    startedAt.current = Date.now();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let acc = "";
    let usedTool = false;
    try {
      await saveDeck(deck, "commit"); // snapshot to deck.json so Claude reads the latest state
      await chatStream(m, selection, scope, (e) => {
        if (e.type === "text") { acc += e.text; setStreaming(acc); }
        else if (e.type === "tool") { usedTool = true; acc += `${acc && !acc.endsWith("\n") ? "\n" : ""}  ⚙ ${e.name}…\n`; setStreaming(acc); }
        else if (e.type === "error") { setLog((l) => [...l, { role: "error", text: e.error }]); }
        else if (e.type === "done") { if (!acc.trim() && e.reply) { acc = e.reply; setStreaming(acc); } }
      }, ctrl.signal);
      if (acc.trim()) setLog((l) => [...l, { role: "claude", text: acc.trim() }]);
      if (usedTool) onDeck(await loadDeck()); // Claude edits the deck file → reload it into the canvas
    } catch (err) {
      if (ctrl.signal.aborted) setLog((l) => [...l, { role: "claude", text: (acc.trim() ? acc.trim() + "\n" : "") + "  ⛔ stopped" }]);
      else setLog((l) => [...l, { role: "error", text: String((err as Error)?.message ?? err) }]);
    } finally {
      abortRef.current = null;
      setStreaming(null);
      setBusy(false);
      if (!stoppedRef.current && queueRef.current.length) {
        const [next, ...rest] = queueRef.current;
        setQ(rest);
        submit(next);
      }
      stoppedRef.current = false;
    }
  };

  // Enter: send now if idle, otherwise queue it. New messages also go into the up-arrow history.
  const onEnter = () => {
    const m = msg.trim();
    if (!m) return;
    setMsg("");
    histIdx.current = null;
    setHistory((h) => [...h, m]);
    if (busy) setQ((q) => [...q, m]);
    else submit(m);
  };

  // Stop the in-flight turn (Esc / stop button). Aborts the stream and interrupts the server turn;
  // the queue is left intact (it does NOT auto-advance after a manual stop).
  const stop = () => {
    if (!busy) return;
    stoppedRef.current = true;
    abortRef.current?.abort();
    stopChat();
  };

  // Up/Down arrows: edit a queued message (most recent first) when the box is empty, else shell-style
  // recall of previously entered messages.
  const onArrow = (dir: -1 | 1) => {
    if (dir === -1 && msg === "" && queueRef.current.length) {
      const last = queueRef.current[queueRef.current.length - 1];
      setQ((q) => q.slice(0, -1));
      setMsg(last);
      return;
    }
    if (!history.length) return;
    let idx = histIdx.current;
    if (idx === null) idx = dir === -1 ? history.length - 1 : history.length;
    else idx += dir;
    if (idx < 0) idx = 0;
    if (idx >= history.length) { histIdx.current = null; setMsg(""); return; }
    histIdx.current = idx;
    setMsg(history[idx]);
  };

  const elapsed = ((Date.now() - startedAt.current) / 1000).toFixed(1);
  const PROMPT = <span style={{ color: "#5dd08a" }}>❯ </span>;

  return (
    <div style={{ flex: "0 0 auto", height, display: "flex", flexDirection: "column", borderTop: "1px solid rgba(255,255,255,0.1)", background: "#0a0c10", fontFamily: MONO }}>
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 14px", fontSize: 12.5, lineHeight: 1.55 }}>
        {log.length === 0 && !busy && (
          <div style={{ color: "rgba(255,255,255,0.32)" }}>claude code · deck session — ask, discuss, or tell it what to change. ↵ to send.</div>
        )}
        {log.slice(-LOG_CAP).map((l, i) => (
          <div key={i} style={{ whiteSpace: "pre-wrap", color: l.role === "error" ? "#ef6b7d" : l.role === "you" ? "#e8e9ee" : "#b9c2cc" }}>
            {l.role === "you" ? PROMPT : l.role === "error" ? <span style={{ color: "#ef6b7d" }}>! </span> : null}
            {l.text}
          </div>
        ))}
        {busy && (
          <div style={{ whiteSpace: "pre-wrap", color: "#b9c2cc" }}>
            {streaming}
            <span style={{ color: "#8b8df0" }}>{streaming ? " " : ""}{SPIN[tick % SPIN.length]}</span>
            <span style={{ color: "rgba(255,255,255,0.3)" }}> {elapsed}s</span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "0 12px 8px", flexWrap: "wrap", fontSize: 11 }}>
        <div style={{ display: "flex", borderRadius: 5, overflow: "hidden", border: "1px solid rgba(255,255,255,0.14)" }}>
          {(["slide", "deck"] as const).map((s) => (
            <button key={s} onClick={() => setScope(s)} style={{ ...chip, borderRadius: 0, border: "none", background: scope === s ? "#23314a" : "transparent", color: scope === s ? "#cfe3ff" : "rgba(255,255,255,0.5)" }}>
              {s === "deck" ? "deck" : "slide"}
            </button>
          ))}
        </div>
        {PRESETS.map((p) => (
          <button key={p} onClick={() => { setHistory((h) => [...h, p]); if (busy) setQ((q) => [...q, p]); else submit(p); }} style={chip} title={p}>
            {p.length > 24 ? p.slice(0, 22) + "…" : p}
          </button>
        ))}
        {log.length > 0 && (
          <button onClick={() => { setLog([]); saveLog([]); }} style={{ ...chip, marginLeft: "auto", color: "rgba(255,255,255,0.45)" }} title="Clear the chat transcript">
            clear
          </button>
        )}
      </div>

      {queue.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "0 14px 6px" }}>
          {queue.map((q, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "rgba(255,255,255,0.6)" }}>
              <span style={{ color: "#8b8df0" }}>queued</span>
              <span onClick={() => { setMsg(q); setQ((cur) => cur.filter((_, j) => j !== i)); }} title="Click to edit (↑ also recalls)" style={{ flex: 1, cursor: "text", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{q}</span>
              <span onClick={() => setQ((cur) => cur.filter((_, j) => j !== i))} title="Remove from queue" style={{ cursor: "pointer", color: "rgba(255,255,255,0.4)" }}>✕</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px 12px" }}>
        <span style={{ color: "#5dd08a", fontFamily: MONO, fontSize: 14 }}>❯</span>
        <input
          value={msg}
          placeholder={busy ? "queue a message…  (Esc / stop to interrupt)" : "message claude   (↑ history)"}
          onChange={(e) => { setMsg(e.target.value); histIdx.current = null; }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onEnter(); }
            else if (e.key === "ArrowUp") { e.preventDefault(); onArrow(-1); }
            else if (e.key === "ArrowDown") { e.preventDefault(); onArrow(1); }
            else if (e.key === "Escape" && busy) { e.preventDefault(); stop(); }
          }}
          style={input}
        />
        {busy ? (
          <button onClick={stop} style={{ ...sendBtn, color: "#ef9aa2", borderColor: "rgba(239,107,125,0.5)" }}>stop ⎋</button>
        ) : (
          <button onClick={onEnter} style={sendBtn}>send ↵</button>
        )}
      </div>
    </div>
  );
};

const chip: CSSProperties = {
  background: "#12151c",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 5,
  color: "rgba(255,255,255,0.65)",
  fontSize: 11,
  padding: "4px 8px",
  cursor: "pointer",
  fontFamily: MONO,
};

const input: CSSProperties = {
  flex: 1,
  background: "transparent",
  border: "none",
  color: "#e8e9ee",
  fontSize: 13,
  padding: "6px 0",
  fontFamily: MONO,
  outline: "none",
};

const sendBtn: CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(255,255,255,0.18)",
  color: "#cfe3ff",
  borderRadius: 6,
  padding: "5px 12px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: MONO,
};
