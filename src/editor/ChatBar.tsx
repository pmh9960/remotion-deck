import { useState, type CSSProperties } from "react";
import type { DeckJson } from "../schema.js";
import { chatEdit, type ChatSelection } from "./api.js";

type Line = { role: "you" | "claude" | "error"; text: string };

const PRESETS = [
  "Make this look more polished and professional",
  "Make the spacing and vertical rhythm even",
  "Align everything to a consistent left margin",
  "Unify the colors and fonts across the slide",
];

/** Bottom chat bar: type (or pick a preset), Claude edits the deck, changes apply live. */
export const ChatBar = ({ deck, onDeck, selection }: { deck: DeckJson; onDeck: (d: DeckJson) => void; selection: ChatSelection }) => {
  const [msg, setMsg] = useState("");
  const [log, setLog] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<"deck" | "slide">("deck");

  const sendText = async (m: string) => {
    if (!m.trim() || busy) return;
    setLog((l) => [...l, { role: "you", text: m }]);
    setBusy(true);
    const reply = await chatEdit(m, deck, selection, scope);
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
        <div style={{ maxHeight: 110, overflowY: "auto", padding: "10px 14px 0", fontSize: 12.5, lineHeight: 1.5 }}>
          {log.slice(-8).map((l, i) => (
            <div key={i} style={{ marginBottom: 3, color: l.role === "error" ? "#ef6b7d" : l.role === "you" ? "#e8e9ee" : "#8b8df0" }}>
              <b>{l.role}:</b> {l.text}
            </div>
          ))}
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
          placeholder={busy ? "Claude is editing the deck…" : "Tell Claude how to change the deck — e.g. “make the title bigger and add a thank-you slide”"}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { const m = msg.trim(); setMsg(""); sendText(m); } }}
          style={input}
        />
        <button onClick={() => { const m = msg.trim(); setMsg(""); sendText(m); }} disabled={busy} style={sendBtn}>Send</button>
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
