import { useState, type CSSProperties } from "react";
import type { DeckJson } from "../schema.js";
import { chatEdit } from "./api.js";

type Line = { role: "you" | "claude" | "error"; text: string };

/** Bottom chat bar: type an instruction, Claude edits the deck JSON, changes apply live. */
export const ChatBar = ({ deck, onDeck }: { deck: DeckJson; onDeck: (d: DeckJson) => void }) => {
  const [msg, setMsg] = useState("");
  const [log, setLog] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const m = msg.trim();
    if (!m || busy) return;
    setMsg("");
    setLog((l) => [...l, { role: "you", text: m }]);
    setBusy(true);
    const reply = await chatEdit(m, deck);
    if (reply.error) setLog((l) => [...l, { role: "error", text: reply.error as string }]);
    else if (reply.deck) {
      onDeck(reply.deck);
      setLog((l) => [...l, { role: "claude", text: "updated the deck ✓" }]);
    }
    setBusy(false);
  };

  return (
    <div style={{ flex: "0 0 auto", borderTop: "1px solid rgba(255,255,255,0.08)", background: "#0d0f16" }}>
      {log.length > 0 && (
        <div style={{ maxHeight: 120, overflowY: "auto", padding: "10px 14px 0", fontSize: 12.5, lineHeight: 1.5 }}>
          {log.slice(-8).map((l, i) => (
            <div key={i} style={{ marginBottom: 3, color: l.role === "error" ? "#ef6b7d" : l.role === "you" ? "#e8e9ee" : "#8b8df0" }}>
              <b>{l.role}:</b> {l.text}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, padding: 12 }}>
        <input
          value={msg}
          disabled={busy}
          placeholder={busy ? "Claude is editing the deck…" : "Tell Claude how to change the deck — e.g. “make the title bigger and add a thank-you slide”"}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          style={input}
        />
        <button onClick={send} disabled={busy} style={btn}>Send</button>
      </div>
    </div>
  );
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

const btn: CSSProperties = {
  background: "linear-gradient(135deg, #6366f1, #ec4899)",
  border: "none",
  color: "#fff",
  borderRadius: 8,
  padding: "0 18px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
