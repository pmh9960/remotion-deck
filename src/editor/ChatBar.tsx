import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { DeckJson } from "../schema.js";
import { chatStream, loadDeck, saveDeck, type ChatSelection } from "./api.js";

type Line = { role: "you" | "claude" | "error"; text: string };

const PRESETS = [
  "Make this look more polished and professional",
  "Make the spacing and vertical rhythm even",
  "Align everything to a consistent left margin",
];

const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

/**
 * Terminal-style chat: a real, conversational Claude Code session scoped to this deck. You type at
 * the ❯ prompt, Claude answers (and edits the deck file directly when asked); replies stream in
 * live like a CLI session. Back-and-forth context is kept by the warm server process.
 */
export const ChatBar = ({ deck, onDeck, selection }: { deck: DeckJson; onDeck: (d: DeckJson) => void; selection: ChatSelection }) => {
  const [msg, setMsg] = useState("");
  const [log, setLog] = useState<Line[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<"deck" | "slide">("deck");
  const [tick, setTick] = useState(0);
  const startedAt = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setTick((n) => n + 1), 120);
    return () => clearInterval(t);
  }, [busy]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [log, streaming]);

  const sendText = async (m: string) => {
    if (!m.trim() || busy) return;
    setLog((l) => [...l, { role: "you", text: m }]);
    setBusy(true);
    setStreaming("");
    startedAt.current = Date.now();
    let acc = "";
    let usedTool = false;
    try {
      await saveDeck(deck, "commit"); // snapshot to deck.json so Claude reads the latest state
      await chatStream(m, selection, scope, (e) => {
        if (e.type === "text") { acc += e.text; setStreaming(acc); }
        else if (e.type === "tool") { usedTool = true; acc += `${acc && !acc.endsWith("\n") ? "\n" : ""}  ⚙ ${e.name}…\n`; setStreaming(acc); }
        else if (e.type === "error") { setLog((l) => [...l, { role: "error", text: e.error }]); }
        else if (e.type === "done") { if (!acc.trim() && e.reply) { acc = e.reply; setStreaming(acc); } }
      });
      if (acc.trim()) setLog((l) => [...l, { role: "claude", text: acc.trim() }]);
      if (usedTool) onDeck(await loadDeck()); // Claude edits the deck file → reload it into the canvas
    } catch (err) {
      setLog((l) => [...l, { role: "error", text: String((err as Error)?.message ?? err) }]);
    } finally {
      setStreaming(null);
      setBusy(false);
    }
  };

  const elapsed = ((Date.now() - startedAt.current) / 1000).toFixed(1);
  const PROMPT = <span style={{ color: "#5dd08a" }}>❯ </span>;

  return (
    <div style={{ flex: "0 0 auto", borderTop: "1px solid rgba(255,255,255,0.1)", background: "#0a0c10", fontFamily: MONO }}>
      <div ref={scrollRef} style={{ height: 188, overflowY: "auto", padding: "10px 14px", fontSize: 12.5, lineHeight: 1.55 }}>
        {log.length === 0 && !busy && (
          <div style={{ color: "rgba(255,255,255,0.32)" }}>claude code · deck session — ask, discuss, or tell it what to change. ↵ to send.</div>
        )}
        {log.slice(-40).map((l, i) => (
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
          {(["deck", "slide"] as const).map((s) => (
            <button key={s} onClick={() => setScope(s)} style={{ ...chip, borderRadius: 0, border: "none", background: scope === s ? "#23314a" : "transparent", color: scope === s ? "#cfe3ff" : "rgba(255,255,255,0.5)" }}>
              {s === "deck" ? "deck" : "slide"}
            </button>
          ))}
        </div>
        {PRESETS.map((p) => (
          <button key={p} disabled={busy} onClick={() => sendText(p)} style={chip} title={p}>
            {p.length > 24 ? p.slice(0, 22) + "…" : p}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px 12px" }}>
        <span style={{ color: "#5dd08a", fontFamily: MONO, fontSize: 14 }}>❯</span>
        <input
          value={msg}
          disabled={busy}
          placeholder={busy ? "working…" : "message claude"}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { const m = msg.trim(); setMsg(""); sendText(m); } }}
          style={input}
        />
        <button onClick={() => { const m = msg.trim(); setMsg(""); sendText(m); }} disabled={busy} style={{ ...sendBtn, opacity: busy ? 0.5 : 1 }}>{busy ? "…" : "send ↵"}</button>
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
