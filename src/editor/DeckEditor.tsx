import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { deckFromJson } from "../deckFromJson.js";
import { SlideDeck } from "../SlideDeck.js";
import { resolveDeckConfig, resolveTheme, type SlideElement, type SlideJson } from "../schema.js";
import { Canvas } from "./Canvas.js";
import { ChatBar } from "./ChatBar.js";
import { SlideRail } from "./SlideRail.js";
import { TextPanel } from "./TextPanel.js";
import { useDeckStore } from "./useDeckStore.js";

export const DeckEditor = () => {
  const { deck, update, commit, undo, redo, save, status } = useDeckStore();
  const [sel, setSel] = useState(0);
  const [railSel, setRailSel] = useState<number[]>([0]); // multi-selected slide indices in the rail
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [playing, setPlaying] = useState(false);
  // The slide currently shown in the fullscreen player, so closing returns the editor there.
  const [presentIndex, setPresentIndex] = useState(0);
  const [exportMsg, setExportMsg] = useState("");
  // Resizable panel sizes (px), dragged via the splitters between panels.
  const [railW, setRailW] = useState(208);
  const [panelW, setPanelW] = useState(340);
  const [chatH, setChatH] = useState(260);
  const wheelLock = useRef(0);
  const clipboard = useRef<SlideJson[]>([]); // copied/cut slides (rail-level clipboard)

  // Global shortcuts: arrows page slides when nothing is selected (Canvas nudges the selection
  // otherwise); Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z (or Ctrl+Y) redo, Ctrl/Cmd+S save.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // While the fullscreen player is open, Esc exits it and drops the editor onto the slide
      // that was on screen; SlideDeck owns the in-present arrow/wheel navigation otherwise.
      if (playing) {
        if (e.key === "Escape") {
          e.preventDefault();
          setPlaying(false);
          setSel(presentIndex);
          setSelectedIds([]);
        }
        return;
      }
      const tag = document.activeElement?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const k = e.key.toLowerCase();
      if (selectedIds.length === 0 && ["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(k)) {
        e.preventDefault();
        const dir = k === "arrowleft" || k === "arrowup" ? -1 : 1;
        setSel((s) => {
          const n = deck ? deck.slides.length : 1;
          const next = Math.max(0, Math.min(n - 1, Math.min(s, n - 1) + dir));
          setRailSel([next]);
          return next;
        });
        setSelectedIds([]);
        return;
      }
      // Slide clipboard / delete (rail level) — only when no canvas element is selected,
      // so element editing keeps its own Delete/copy semantics.
      if (selectedIds.length === 0 && deck) {
        if (k === "delete" || k === "backspace") { e.preventDefault(); deleteSelectedSlides(); return; }
        if ((e.ctrlKey || e.metaKey) && k === "c") { e.preventDefault(); copySelectedSlides(); return; }
        if ((e.ctrlKey || e.metaKey) && k === "x") { e.preventDefault(); cutSelectedSlides(); return; }
        if ((e.ctrlKey || e.metaKey) && k === "v") { e.preventDefault(); pasteSlides(); return; }
      }
      if (!(e.ctrlKey || e.metaKey)) return;
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
  }, [undo, redo, save, selectedIds, deck, playing, presentIndex, railSel, sel]);

  // Load the deck's webfont (config.theme.fontUrl) so a non-system `font` family renders.
  useEffect(() => {
    const url = deck?.config?.theme?.fontUrl;
    if (!url) return;
    let link = document.getElementById("deck-font") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = "deck-font";
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    if (link.getAttribute("href") !== url) link.setAttribute("href", url);
  }, [deck?.config?.theme?.fontUrl]);

  if (!deck) {
    return <div style={{ color: "#888", padding: 40, fontFamily: "system-ui" }}>Loading deck…</div>;
  }

  const index = Math.min(sel, deck.slides.length - 1);
  const slide = deck.slides[index];
  const theme = resolveTheme(deck.config?.theme);
  const config = resolveDeckConfig(deck.config);

  const updateSlide = (next: SlideJson, transient?: boolean) =>
    update({ ...deck, slides: deck.slides.map((s, i) => (i === index ? next : s)) }, transient);

  const doExport = async (format: "pdf" | "html") => {
    setExportMsg(format === "pdf" ? "exporting PDF…" : "exporting HTML…");
    try {
      const res = await fetch("/__export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ format, deck }) });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setExportMsg(`export failed: ${data.error ?? res.statusText}`);
      } else {
        // The server streams the rendered file back; trigger a browser download to the local machine.
        const blob = await res.blob();
        const name = res.headers.get("x-remotion-deck-output") ?? (format === "pdf" ? "presentation.pdf" : "presentation.html");
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setExportMsg(`downloaded ${name}`);
      }
    } catch (e) {
      setExportMsg(`export failed: ${String(e)}`);
    }
    setTimeout(() => setExportMsg(""), 5000);
  };

  // Throttled wheel over the canvas changes the current slide.
  const wheelNav = (dir: -1 | 1) => {
    const now = Date.now();
    if (now - wheelLock.current < 300) return;
    wheelLock.current = now;
    setSel(Math.max(0, Math.min(deck.slides.length - 1, index + dir)));
    setSelectedIds([]);
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
    setSelectedIds([id]);
  };

  // --- align / distribute selected elements ---
  const alignSelected = (how: "left" | "hcenter" | "right" | "top" | "vmiddle" | "bottom") => {
    const sel = slide.elements.filter((e) => selectedIds.includes(e.id));
    if (sel.length < 2) return;
    const left = Math.min(...sel.map((e) => e.x));
    const right = Math.max(...sel.map((e) => e.x + e.w));
    const top = Math.min(...sel.map((e) => e.y));
    const bottom = Math.max(...sel.map((e) => e.y + e.h));
    const place = (e: SlideElement) => {
      if (how === "left") return { x: left };
      if (how === "right") return { x: right - e.w };
      if (how === "hcenter") return { x: Math.round((left + right) / 2 - e.w / 2) };
      if (how === "top") return { y: top };
      if (how === "bottom") return { y: bottom - e.h };
      return { y: Math.round((top + bottom) / 2 - e.h / 2) };
    };
    updateSlide({ ...slide, elements: slide.elements.map((e) => (selectedIds.includes(e.id) ? { ...e, ...place(e) } : e)) });
  };
  const distributeSelected = (axis: "h" | "v") => {
    const sel = slide.elements.filter((e) => selectedIds.includes(e.id));
    if (sel.length < 3) return;
    const sorted = [...sel].sort((a, b) => (axis === "h" ? a.x - b.x : a.y - b.y));
    const start = axis === "h" ? sorted[0].x : sorted[0].y;
    const end = axis === "h" ? sorted[sorted.length - 1].x + sorted[sorted.length - 1].w : sorted[sorted.length - 1].y + sorted[sorted.length - 1].h;
    const sizeSum = sorted.reduce((s, e) => s + (axis === "h" ? e.w : e.h), 0);
    const gap = (end - start - sizeSum) / (sorted.length - 1);
    let cursor = start;
    const pos = new Map<string, number>();
    for (const e of sorted) { pos.set(e.id, Math.round(cursor)); cursor += (axis === "h" ? e.w : e.h) + gap; }
    updateSlide({ ...slide, elements: slide.elements.map((e) => (pos.has(e.id) ? { ...e, ...(axis === "h" ? { x: pos.get(e.id) as number } : { y: pos.get(e.id) as number }) } : e)) });
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
    const s = Math.max(0, Math.min(select, slides.length - 1));
    setSel(s);
    setRailSel([s]);
    setSelectedIds([]);
  };
  // Rail selection: plain click = single, Ctrl/⌘ = toggle, Shift = contiguous range from the active.
  const selectSlide = (i: number, mode: "single" | "toggle" | "range") => {
    if (mode === "toggle") {
      setRailSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));
    } else if (mode === "range") {
      const a = Math.min(index, i);
      const b = Math.max(index, i);
      setRailSel(Array.from({ length: b - a + 1 }, (_, k) => a + k));
    } else {
      setRailSel([i]);
    }
    setSel(i);
    setSelectedIds([]);
  };
  // Drag-reorder: move every rail-selected slide (in their current order) to land at `toIndex`.
  const reorderSlides = (toIndex: number) => {
    const selSet = new Set(railSel.length ? railSel : [index]);
    const picked = deck.slides.filter((_, i) => selSet.has(i));
    const rest = deck.slides.filter((_, i) => !selSet.has(i));
    let before = 0;
    for (let i = 0; i < toIndex; i++) if (!selSet.has(i)) before += 1;
    const slides = [...rest.slice(0, before), ...picked, ...rest.slice(before)];
    update({ ...deck, slides });
    setRailSel(picked.map((_, k) => before + k));
    setSel(before);
    setSelectedIds([]);
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
  // current rail selection as an index set (falls back to the active slide).
  const railSet = () => new Set(railSel.length ? railSel : [index]);
  const copySelectedSlides = () => {
    const set = railSet();
    clipboard.current = deck.slides.filter((_, i) => set.has(i)).map((s) => JSON.parse(JSON.stringify(s)));
  };
  const deleteSelectedSlides = () => {
    const set = railSet();
    const slides = deck.slides.filter((_, i) => !set.has(i));
    if (!slides.length) return; // never empty the deck
    withSlides(slides, Math.min(Math.min(...set), slides.length - 1));
  };
  const cutSelectedSlides = () => {
    copySelectedSlides();
    deleteSelectedSlides();
  };
  const pasteSlides = () => {
    if (!clipboard.current.length) return;
    const seen = new Set(deck.slides.map((s) => s.id));
    const freshId = (base: string) => {
      let id = base, n = 2;
      while (seen.has(id)) id = `${base}-${n++}`;
      seen.add(id);
      return id;
    };
    const copies: SlideJson[] = clipboard.current.map((s) => {
      const c = JSON.parse(JSON.stringify(s)) as SlideJson;
      c.id = freshId(`${c.id.replace(/-copy(-\d+)?$/, "")}-copy`);
      return c;
    });
    const at = Math.min(index + 1, deck.slides.length);
    const slides = [...deck.slides.slice(0, at), ...copies, ...deck.slides.slice(at)];
    update({ ...deck, slides });
    setSel(at);
    setRailSel(copies.map((_, k) => at + k));
    setSelectedIds([]);
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
        {selectedIds.length >= 2 && (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginRight: 4 }}>{selectedIds.length} selected</span>
            <button onClick={() => alignSelected("left")} title="Align left" style={iconBtn}>⇤</button>
            <button onClick={() => alignSelected("hcenter")} title="Align center (horizontal)" style={iconBtn}>⇔</button>
            <button onClick={() => alignSelected("right")} title="Align right" style={iconBtn}>⇥</button>
            <span style={{ width: 1, height: 18, background: "rgba(255,255,255,0.12)" }} />
            <button onClick={() => alignSelected("top")} title="Align top" style={iconBtn}>⤒</button>
            <button onClick={() => alignSelected("vmiddle")} title="Align middle (vertical)" style={iconBtn}>⇕</button>
            <button onClick={() => alignSelected("bottom")} title="Align bottom" style={iconBtn}>⤓</button>
            <span style={{ width: 1, height: 18, background: "rgba(255,255,255,0.12)" }} />
            <button onClick={() => distributeSelected("h")} title="Distribute horizontally" style={iconBtn}>↔</button>
            <button onClick={() => distributeSelected("v")} title="Distribute vertically" style={iconBtn}>↕</button>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={undo} title="Undo (Ctrl+Z)" style={iconBtn}>↶</button>
          <button onClick={redo} title="Redo (Ctrl+Shift+Z)" style={iconBtn}>↷</button>
          <span title="Edits autosave to deck.autosave.json; Ctrl+S writes deck.json" style={{ fontSize: 12, marginLeft: 6, color: status === "saving" ? "#e9b949" : status === "draft" ? "#e9b949" : "rgba(255,255,255,0.45)" }}>
            {status === "saving" ? "saving…" : status === "draft" ? "draft · ⌘S to save" : "saved"}
          </span>
          {exportMsg && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{exportMsg}</span>}
          <button onClick={() => doExport("pdf")} title="Download presentation.pdf to your machine" style={btn}>⬇ PDF</button>
          <button onClick={() => doExport("html")} title="Download self-contained presentation.html to your machine" style={btn}>⬇ HTML</button>
          <button onClick={() => setPlaying(true)} style={{ ...btn, marginLeft: 6 }}>▶ Play</button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <SlideRail deck={deck} selected={index} selectedSet={railSel} width={railW} onSelect={selectSlide} onAdd={addSlide} onDuplicate={duplicateSlide} onDelete={deleteSlide} onMove={moveSlide} onReorder={reorderSlides} />
        <Splitter dir="col" onDrag={(d) => setRailW((w) => clamp(w + d, 120, 480))} />
        <Canvas slide={slide} slideIndex={index} theme={theme} config={config} selectedIds={selectedIds} onSelectIds={setSelectedIds} onChangeSlide={updateSlide} onCommit={commit} onWheelNav={wheelNav} />
        <Splitter dir="col" onDrag={(d) => setPanelW((w) => clamp(w - d, 200, 680))} />
        <TextPanel slide={slide} selectedId={selectedIds.length === 1 ? selectedIds[0] : null} width={panelW} onSelect={(id) => setSelectedIds([id])} onChange={updateSlide} onCommit={commit} />
      </div>

      <Splitter dir="row" onDrag={(d) => setChatH((h) => clamp(h - d, 120, 640))} />
      <ChatBar deck={deck} onDeck={update} selection={{ slideId: slide.id, elementId: selectedIds.length === 1 ? selectedIds[0] : undefined }} height={chatH} />

      {playing && (
        <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 100 }}>
          <SlideDeck slides={deckFromJson(deck, "present").slides} config={config} initialIndex={index} onIndexChange={setPresentIndex} advanceOnClick={false} />
          <button onClick={() => { setPlaying(false); setSel(presentIndex); setSelectedIds([]); }} style={{ ...btn, position: "fixed", top: 16, right: 16, zIndex: 101 }}>✕ Close (Esc)</button>
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

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Thin draggable bar between panels. dir "col" resizes width (drag x), "row" resizes height (drag y). */
const Splitter = ({ dir, onDrag }: { dir: "col" | "row"; onDrag: (deltaPx: number) => void }) => {
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    let last = dir === "col" ? e.clientX : e.clientY;
    const move = (ev: PointerEvent) => {
      const cur = dir === "col" ? ev.clientX : ev.clientY;
      onDrag(cur - last);
      last = cur;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = dir === "col" ? "col-resize" : "row-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div
      onPointerDown={onPointerDown}
      title="Drag to resize"
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(99,102,241,0.55)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
      style={{ flex: "0 0 auto", background: "rgba(255,255,255,0.05)", ...(dir === "col" ? { width: 6, cursor: "col-resize" } : { height: 6, cursor: "row-resize" }) }}
    />
  );
};
