import { useEffect, useState, type CSSProperties } from "react";
import { deckFromJson } from "../deckFromJson.js";
import { SlideDeck } from "../SlideDeck.js";
import { resolveDeckConfig, resolveTheme, type SlideJson } from "../schema.js";
import { Canvas } from "./Canvas.js";
import { SlideRail } from "./SlideRail.js";
import { TextPanel } from "./TextPanel.js";
import { useDeckStore } from "./useDeckStore.js";

export const DeckEditor = () => {
  const { deck, update, undo, redo, save, status } = useDeckStore();
  const [sel, setSel] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  // Global shortcuts: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z (or Ctrl+Y) redo, Ctrl/Cmd+S save.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        redo();
      } else if (k === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, save]);

  if (!deck) {
    return <div style={{ color: "#888", padding: 40, fontFamily: "system-ui" }}>Loading deck…</div>;
  }

  const index = Math.min(sel, deck.slides.length - 1);
  const slide = deck.slides[index];
  const theme = resolveTheme(deck.config?.theme);
  const config = resolveDeckConfig(deck.config);

  const updateSlide = (next: SlideJson) =>
    update({ ...deck, slides: deck.slides.map((s, i) => (i === index ? next : s)) });

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif", color: "#e8e9ee" }}>
      <div style={{ height: 48, flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", background: "#0d0f16", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.02em" }}>
          remotion-deck <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>editor</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={undo} title="Undo (Ctrl+Z)" style={iconBtn}>↶</button>
          <button onClick={redo} title="Redo (Ctrl+Shift+Z)" style={iconBtn}>↷</button>
          <span style={{ fontSize: 12, marginLeft: 6, color: status === "saving" ? "#e9b949" : "rgba(255,255,255,0.45)" }}>
            {status === "saving" ? "saving…" : "saved"}
          </span>
          <button onClick={() => setPlaying(true)} style={{ ...btn, marginLeft: 6 }}>▶ Play</button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <SlideRail deck={deck} selected={index} onSelect={(i) => { setSel(i); setSelectedId(null); }} />
        <Canvas slide={slide} theme={theme} config={config} selectedId={selectedId} onSelect={setSelectedId} onChangeSlide={updateSlide} />
        <TextPanel slide={slide} selectedId={selectedId} onSelect={setSelectedId} onChange={updateSlide} />
      </div>

      {playing && (
        <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 100 }}>
          <SlideDeck slides={deckFromJson(deck).slides} config={config} initialIndex={index} />
          <button onClick={() => setPlaying(false)} style={{ ...btn, position: "fixed", top: 16, right: 16, zIndex: 101 }}>✕ Close</button>
        </div>
      )}
    </div>
  );
};

const btn: CSSProperties = {
  background: "#1b1e29",
  border: "1px solid rgba(255,255,255,0.14)",
  color: "#e8e9ee",
  borderRadius: 7,
  padding: "6px 14px",
  fontSize: 13,
  cursor: "pointer",
};

const iconBtn: CSSProperties = {
  background: "#15171f",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e8e9ee",
  borderRadius: 7,
  width: 30,
  height: 30,
  fontSize: 15,
  cursor: "pointer",
  lineHeight: 1,
};
