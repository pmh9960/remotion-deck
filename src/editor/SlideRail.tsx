import { useEffect, useRef, useState, type CSSProperties } from "react";
import { renderSlide } from "../SlideRenderer.js";
import { resolveDeckConfig, resolveTheme, type DeckJson } from "../schema.js";

/** Highlight for the active thumbnail — a bright blue that reads clearly on the dark rail. */
const SELECTED_OUTLINE = "3px solid #4d9bff";
const SELECTED_GLOW = "0 0 0 1px #4d9bff, 0 0 14px rgba(77,155,255,0.55)";
/** Softer ring for slides that are part of a multi-selection but not the active one. */
const MULTI_OUTLINE = "2px solid rgba(77,155,255,0.6)";

const miniBtn: CSSProperties = {
  flex: 1,
  background: "#15171f",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "rgba(255,255,255,0.7)",
  borderRadius: 5,
  fontSize: 12,
  padding: "3px 0",
  cursor: "pointer",
  lineHeight: 1,
};

/** Reorder mode for a thumbnail click: plain = single, Ctrl/⌘ = toggle, Shift = range. */
export type SelectMode = "single" | "toggle" | "range";

/** Left rail of slide thumbnails with add / duplicate / delete / drag-reorder + multi-select. */
export const SlideRail = ({
  deck,
  selected,
  selectedSet,
  width,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onMove,
  onReorder,
}: {
  deck: DeckJson;
  selected: number;
  selectedSet: number[];
  width: number;
  onSelect: (index: number, mode: SelectMode) => void;
  onAdd: () => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onReorder: (toIndex: number) => void;
}) => {
  const cfg = resolveDeckConfig(deck.config);
  const theme = resolveTheme(deck.config?.theme);
  // Keep the active thumbnail in view when the selection changes from outside the rail
  // (arrow keys / wheel over the canvas), so the rail follows the slide you're viewing.
  const activeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);
  // gap index (0..n) the drag is hovering over — where the dragged slides would land.
  const [dropGap, setDropGap] = useState<number | null>(null);
  const dragging = useRef(false);

  // Thumbnails fill the rail width (minus the 16px padding each side) so widening the sidebar
  // grows the previews.
  const thumbW = Math.max(120, width - 32);
  const scale = thumbW / cfg.width;
  const thumbH = cfg.height * scale;
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  const selSet = new Set(selectedSet);

  const modeOf = (e: React.MouseEvent): SelectMode =>
    e.shiftKey ? "range" : e.ctrlKey || e.metaKey ? "toggle" : "single";

  // dragover on slide i → land before i (top half) or after i (bottom half).
  const gapFor = (i: number, e: React.DragEvent): number => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return e.clientY - r.top < r.height / 2 ? i : i + 1;
  };

  const onDragStartItem = (i: number, e: React.DragEvent) => {
    if (!selSet.has(i)) onSelect(i, "single"); // dragging an unselected slide grabs just it
    dragging.current = true;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(i)); // Firefox needs a payload to start a drag
  };
  const onDropAt = (gap: number) => {
    dragging.current = false;
    setDropGap(null);
    onReorder(gap);
  };

  const dropLine = (gap: number) => (
    <div style={{ height: 0, borderTop: dropGap === gap ? "2px solid #4d9bff" : "2px solid transparent", margin: "-9px 0 7px", borderRadius: 2 }} />
  );

  return (
    <div style={{ width, flex: "0 0 auto", overflowY: "auto", padding: 16, background: "#0d0f16", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
      {deck.slides.map((slide, i) => {
        const inSel = selSet.has(i);
        const active = i === selected;
        return (
          <div key={slide.id}>
            {dropLine(i)}
            <div
              ref={active ? activeRef : undefined}
              draggable
              onDragStart={(e) => onDragStartItem(i, e)}
              onDragOver={(e) => { if (dragging.current) { e.preventDefault(); setDropGap(gapFor(i, e)); } }}
              onDrop={(e) => { e.preventDefault(); onDropAt(gapFor(i, e)); }}
              onDragEnd={() => { dragging.current = false; setDropGap(null); }}
              onClick={(e) => onSelect(i, modeOf(e))}
              style={{ marginBottom: 16, cursor: "grab" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: active ? "#4d9bff" : "rgba(255,255,255,0.4)", fontWeight: active ? 700 : 400, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                <span style={{ fontSize: 12, color: active ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{slide.id}</span>
              </div>
              <div style={{ width: thumbW, height: thumbH, position: "relative", overflow: "hidden", borderRadius: 6, outline: active ? SELECTED_OUTLINE : inSel ? MULTI_OUTLINE : "1px solid rgba(255,255,255,0.08)", outlineOffset: active ? -1 : 0, boxShadow: active ? SELECTED_GLOW : "none" }}>
                <div style={{ width: cfg.width, height: cfg.height, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", top: 0, left: 0 }}>
                  {renderSlide(slide, slide.durationInFrames - 1, cfg.fps, theme)}
                </div>
                {inSel && !active && <div style={{ position: "absolute", inset: 0, background: "rgba(77,155,255,0.14)" }} />}
              </div>
              {active && (
                <div style={{ display: "flex", gap: 4, marginTop: 6, width: thumbW }}>
                  <button title="Move up" onClick={stop(() => onMove(i, -1))} style={miniBtn}>↑</button>
                  <button title="Move down" onClick={stop(() => onMove(i, 1))} style={miniBtn}>↓</button>
                  <button title="Duplicate" onClick={stop(() => onDuplicate(i))} style={miniBtn}>⧉</button>
                  <button title="Delete" onClick={stop(() => onDelete(i))} style={{ ...miniBtn, color: "#ef6b7d" }}>✕</button>
                </div>
              )}
            </div>
          </div>
        );
      })}
      {/* drop target after the last slide */}
      <div
        onDragOver={(e) => { if (dragging.current) { e.preventDefault(); setDropGap(deck.slides.length); } }}
        onDrop={(e) => { e.preventDefault(); onDropAt(deck.slides.length); }}
      >
        {dropLine(deck.slides.length)}
      </div>
      <button onClick={onAdd} style={{ width: thumbW, marginTop: 4, padding: "9px 0", background: "#15171f", border: "1px dashed rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.7)", borderRadius: 6, fontSize: 13, cursor: "pointer" }}>
        + Add slide
      </button>
      {selectedSet.length > 1 && (
        <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
          {selectedSet.length} selected · drag to move together
        </div>
      )}
    </div>
  );
};
