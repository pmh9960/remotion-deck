import type { CSSProperties } from "react";
import { renderSlide } from "../SlideRenderer.js";
import { resolveDeckConfig, resolveTheme, type DeckJson } from "../schema.js";

const THUMB_W = 168;

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

/** Left rail of slide thumbnails with add / duplicate / delete / reorder controls. */
export const SlideRail = ({
  deck,
  selected,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onMove,
}: {
  deck: DeckJson;
  selected: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onMove: (index: number, dir: -1 | 1) => void;
}) => {
  const cfg = resolveDeckConfig(deck.config);
  const theme = resolveTheme(deck.config?.theme);
  const scale = THUMB_W / cfg.width;
  const thumbH = cfg.height * scale;
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div style={{ width: 208, flex: "0 0 auto", overflowY: "auto", padding: 16, background: "#0d0f16", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
      {deck.slides.map((slide, i) => (
        <div key={slide.id} onClick={() => onSelect(i)} style={{ marginBottom: 16, cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{slide.id}</span>
          </div>
          <div style={{ width: THUMB_W, height: thumbH, position: "relative", overflow: "hidden", borderRadius: 6, outline: i === selected ? "2px solid #6366f1" : "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ width: cfg.width, height: cfg.height, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", top: 0, left: 0 }}>
              {renderSlide(slide, slide.durationInFrames - 1, cfg.fps, theme)}
            </div>
          </div>
          {i === selected && (
            <div style={{ display: "flex", gap: 4, marginTop: 6, width: THUMB_W }}>
              <button title="Move up" onClick={stop(() => onMove(i, -1))} style={miniBtn}>↑</button>
              <button title="Move down" onClick={stop(() => onMove(i, 1))} style={miniBtn}>↓</button>
              <button title="Duplicate" onClick={stop(() => onDuplicate(i))} style={miniBtn}>⧉</button>
              <button title="Delete" onClick={stop(() => onDelete(i))} style={{ ...miniBtn, color: "#ef6b7d" }}>✕</button>
            </div>
          )}
        </div>
      ))}
      <button onClick={onAdd} style={{ width: THUMB_W, marginTop: 4, padding: "9px 0", background: "#15171f", border: "1px dashed rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.7)", borderRadius: 6, fontSize: 13, cursor: "pointer" }}>
        + Add slide
      </button>
    </div>
  );
};
