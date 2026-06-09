import { renderSlide } from "../SlideRenderer.js";
import { resolveDeckConfig, resolveTheme, type DeckJson } from "../schema.js";

const THUMB_W = 168;

/** Left rail of slide thumbnails (rendered at final frame), click to select. */
export const SlideRail = ({
  deck,
  selected,
  onSelect,
}: {
  deck: DeckJson;
  selected: number;
  onSelect: (index: number) => void;
}) => {
  const cfg = resolveDeckConfig(deck.config);
  const theme = resolveTheme(deck.config?.theme);
  const scale = THUMB_W / cfg.width;
  const thumbH = cfg.height * scale;

  return (
    <div style={{ width: 208, flex: "0 0 auto", overflowY: "auto", padding: 16, background: "#0d0f16", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
      {deck.slides.map((slide, i) => (
        <div
          key={slide.id}
          onClick={() => onSelect(i)}
          style={{ marginBottom: 14, cursor: "pointer" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{slide.id}</span>
          </div>
          <div
            style={{
              width: THUMB_W,
              height: thumbH,
              position: "relative",
              overflow: "hidden",
              borderRadius: 6,
              outline: i === selected ? "2px solid #6366f1" : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ width: cfg.width, height: cfg.height, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", top: 0, left: 0 }}>
              {renderSlide(slide, slide.durationInFrames - 1, cfg.fps, theme)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
