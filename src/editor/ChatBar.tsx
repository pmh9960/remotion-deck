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

/**
 * Bottom chat bar: a real, conversational Claude Code session scoped to this deck. You type,
 * Claude answers (and edits the deck file directly when asked); replies stream in live. Back-and-forth
 * context is kept by the warm server process.
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

  // Drive the spinner + elapsed clock while a turn is in flight.
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setTick((n) => n + 1), 120);
    return () => clearInterval(t);
  }, [busy]);

  // Keep the transcript pinned to the latest line as it streams.
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
      // Snapshot the current in-memory deck to deck.json so Claude reads/edits the latest state.
      await saveDeck(deck, "commit");
      await chatStream(m, selection, scope, (e) => {
        if (e.type === "text") { acc += e.text; setStreaming(acc); }
        else if (e.type === "tool") { usedTool = true; acc += `${acc && !acc.endsWith("\n") ? "\n" : ""}  ⚙ ${e.name}…\n`; setStreaming(acc); }
        else if (e.type === "error") { setLog((l) => [...l, { role: "error", text: e.error }]); }
        else if (e.type === "done") { if (!acc.trim() && e.reply) { acc = e.reply; setStreaming(acc); } }
      });
      if (acc.trim()) setLog((l) => [...l, { role: "claude", text: acc.trim() }]);
      // Claude edits the deck FILE; reload it so the canvas reflects the changes.
      if (usedTool) onDeck(await loadDeck());
    } catch (err) {
      setLog((l) => [...l, { role: "error", text: String((err as Error)?.message ?? err) }]);
    } finally {
      setStreaming(null);
      setBusy(false);
    }
  };

  const elapsed = ((Date.now() - startedAt.current) / 1000).toFixed(1);

  return (
    <div style={{ flex: "0 0 auto", borderTop: "1px solid rgba(255,255,255,0.08)", background: "#0d0f16" }}>
      {(log.length > 0 || busy) && (
        <div ref={scrollRef} style={{ maxHeight: 160, overflowY: "auto", padding: "10px 14px 0", fontSize: 12.5, lineHeight: 1.5 }}>
          {log.slice(-12).map((l, i) => (
            <div key={i} style={{ marginBottom: 4, color: l.role === "error" ? "#ef6b7d" : l.role === "you" ? "#e8e9ee" : "#9a9cf2", whiteSpace: "pre-wrap" }}>
              <b>{l.role}:</b> {l.text}
            </div>
          ))}
          {busy && (
            <div style={{ marginBottom: 4, color: "#9a9cf2", whiteSpace: "pre-wrap" }}>
              <b>claude:</b> {streaming}
              <span style={{ fontFamily: "monospace", color: "#8b8df0" }}>{streaming ? " " : ""}{SPIN[tick % SPIN.length]}</span>
              <span style={{ color: "rgba(255,255,255,0.4)" }}> · {elapsed}s</span>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "10px 12px 0", flexWrap: "wrap" }}>
        <div style={{ display: "flex", borderRadius: 7, overflow: "hidden", border: "1px solid rgba(255,255,255,0.14)" }}>
          {(["deck", "slide"] as const).map((s) => (
            <button key={s} onClick={() => setScope(s)} style={{ ...chip, borderRadius: 0, border: "none", background: scope === s ? "#2a2d3d" : "transparent", color: scope === s ? "#fff" : "rgba(255,255,255,0.6)" }}>
              {s === "deck" ? "Whole deck" : "This slide"}
            </button>
          ))}
        </div>
        {PRESETS.map((p) => (
          <button key={p} disabled={busy} onClick={() => sendText(p)} style={chip} title={p}>
            {p.length > 28 ? p.slice(0, 26) + "…" : p}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, padding: 12 }}>
        <input
          value={msg}
          disabled={busy}
          placeholder={busy ? "Claude is working…" : "Chat with Claude about the deck — ask, discuss, or tell it what to change"}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { const m = msg.trim(); setMsg(""); sendText(m); } }}
          style={input}
        />
        <button onClick={() => { const m = msg.trim(); setMsg(""); sendText(m); }} disabled={busy} style={{ ...sendBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "…" : "Send"}</button>
      </div>
    </div>
  );
};

const chip: CSSProperties = {
  background: "#15171f",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 7,
  color: "rgba(255,255,255,0.75)",
  fontSize: 12,
  padding: "5px 10px",
  cursor: "pointer",
  fontFamily: "inherit",
};

const input: CSSProperties = {
  flex: 1,
  background: "#15171f",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 8,
  color: "#e8e9ee",
  fontSize: 13,
  padding: "10px 12px",
  fontFamily: "inherit",
  outline: "none",
};

const sendBtn: CSSProperties = {
  background: "linear-gradient(135deg, #6366f1, #ec4899)",
  border: "none",
  color: "#fff",
  borderRadius: 8,
  padding: "0 18px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
