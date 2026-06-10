import { useEffect, useRef, useState, type CSSProperties } from "react";
import { deckFromJson } from "../deckFromJson.js";
import { SlideDeck } from "../SlideDeck.js";
import { resolveDeckConfig, resolveTheme, type SlideElement, type SlideJson } from "../schema.js";
import { Canvas } from "./Canvas.js";
import { ChatBar } from "./ChatBar.js";
import { SlideRail } from "./SlideRail.js";
import { TextPanel } from "./TextPanel.js";
import { useDeckStore } from "./useDeckStore.js";

export const DeckEditor = () => {
  const { deck, update, undo, redo, save, status } = useDeckStore();
  const [sel, setSel] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const wheelLock = useRef(0);

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

  // Throttled wheel over the canvas changes the current slide.
  const wheelNav = (dir: -1 | 1) => {
    const now = Date.now();
    if (now - wheelLock.current < 300) return;
    wheelLock.current = now;
    setSel(Math.max(0, Math.min(deck.slides.length - 1, index + dir)));
    setSelectedId(null);
  };

  // --- element insert / copy / paste / delete on the current slide ---
  const uniqueElId = (base: string) => {
    const ids = new Set(slide.elements.map((e) => e.id));
    if (!ids.has(base)) return base;
    let n = 2;
    while (ids.has(`${base}-${n}`)) n += 1;
    return `${base}-${n}`;
  };
  const addElement = (el: SlideElement) => {
    const id = uniqueElId(el.type);
    updateSlide({ ...slide, elements: [...slide.elements, { ...el, id }] });
    setSelectedId(id);
  };
  const insertText = () => addElement({ id: "text", type: "text", x: 660, y: 480, w: 600, h: 130, text: "Text", style: { fontSize: 48, fontWeight: 600 }, animation: { preset: "fade", start: 0 } });
  const insertRect = () => addElement({ id: "rect", type: "shape", shape: "rect", x: 760, y: 440, w: 400, h: 200, style: { background: "#6366f1", borderRadius: 16 }, animation: { preset: "fade", start: 0 } });
  const insertPill = () => addElement({ id: "pill", type: "shape", shape: "pill", x: 780, y: 505, w: 320, h: 70, animation: { preset: "fade", start: 0 } });
  const insertLine = () => addElement({ id: "line", type: "shape", shape: "line", x: 760, y: 540, w: 400, h: 4, style: { background: "#6366f1" }, animation: { preset: "fade", start: 0 } });


  const uniqueId = (base: string) => {
    const ids = new Set(deck.slides.map((s) => s.id));
    if (!ids.has(base)) return base;
    let n = 2;
    while (ids.has(`${base}-${n}`)) n += 1;
    return `${base}-${n}`;
  };
  const withSlides = (slides: SlideJson[], select: number) => {
    update({ ...deck, slides });
    setSel(Math.max(0, Math.min(select, slides.length - 1)));
    setSelectedId(null);
  };
  const addSlide = () => {
    const blank: SlideJson = {
      id: uniqueId("slide"),
      durationInFrames: 90,
      elements: [{ id: "text", type: "text", x: 140, y: 470, w: 1640, h: 160, text: "New slide", style: { fontSize: 72, fontWeight: 800 }, animation: { preset: "rise", start: 0 } }],
    };
    const slides = [...deck.slides];
    slides.splice(index + 1, 0, blank);
    withSlides(slides, index + 1);
  };
  const duplicateSlide = (i: number) => {
    const copy: SlideJson = JSON.parse(JSON.stringify(deck.slides[i]));
    copy.id = uniqueId(`${copy.id}-copy`);
    const slides = [...deck.slides];
    slides.splice(i + 1, 0, copy);
    withSlides(slides, i + 1);
  };
  const deleteSlide = (i: number) => {
    if (deck.slides.length <= 1) return;
    withSlides(deck.slides.filter((_, j) => j !== i), i > 0 ? i - 1 : 0);
  };
  const moveSlide = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= deck.slides.length) return;
    const slides = [...deck.slides];
    const [s] = slides.splice(i, 1);
    slides.splice(j, 0, s);
    withSlides(slides, j);
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif", color: "#e8e9ee" }}>
      <div style={{ height: 48, flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", background: "#0d0f16", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.02em" }}>
            remotion-deck <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>editor</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={insertText} title="Insert text box" style={iconBtn}>T</button>
            <button onClick={insertRect} title="Insert rectangle" style={iconBtn}>▭</button>
            <button onClick={insertPill} title="Insert pill" style={iconBtn}>⬭</button>
            <button onClick={insertLine} title="Insert line" style={iconBtn}>—</button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={undo} title="Undo (Ctrl+Z)" style={iconBtn}>↶</button>
          <button onClick={redo} title="Redo (Ctrl+Shift+Z)" style={iconBtn}>↷</button>
          <span title="Edits autosave to deck.autosave.json; Ctrl+S writes deck.json" style={{ fontSize: 12, marginLeft: 6, color: status === "saving" ? "#e9b949" : status === "draft" ? "#e9b949" : "rgba(255,255,255,0.45)" }}>
            {status === "saving" ? "saving…" : status === "draft" ? "draft · ⌘S to save" : "saved"}
          </span>
          <button onClick={() => setPlaying(true)} style={{ ...btn, marginLeft: 6 }}>▶ Play</button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <SlideRail deck={deck} selected={index} onSelect={(i) => { setSel(i); setSelectedId(null); }} onAdd={addSlide} onDuplicate={duplicateSlide} onDelete={deleteSlide} onMove={moveSlide} />
        <Canvas slide={slide} theme={theme} config={config} selectedId={selectedId} onSelect={setSelectedId} onChangeSlide={updateSlide} onWheelNav={wheelNav} />
        <TextPanel slide={slide} selectedId={selectedId} onSelect={setSelectedId} onChange={updateSlide} />
      </div>

      <ChatBar deck={deck} onDeck={update} selection={{ slideId: slide.id, elementId: selectedId ?? undefined }} />

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
