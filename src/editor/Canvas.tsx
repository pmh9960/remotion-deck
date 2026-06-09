import { renderSlide } from "../SlideRenderer.js";
import type { ResolvedTheme, SlideJson } from "../schema.js";
import { useSize } from "./useSize.js";

/** Renders the slide at its final frame (fully revealed) inside a fitted 1920×1080
 *  stage, with transparent hit-boxes over each element for selection. */
export const Canvas = ({
  slide,
  theme,
  config,
  selectedId,
  onSelect,
}: {
  slide: SlideJson;
  theme: ResolvedTheme;
  config: { fps: number; width: number; height: number };
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) => {
  const { ref, size } = useSize();
  const scale = Math.min(size.w / config.width, size.h / config.height) || 0;
  const lastFrame = slide.durationInFrames - 1;

  return (
    <div
      ref={ref}
      onClick={() => onSelect(null)}
      style={{
        flex: 1,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        background: "#06070b",
      }}
    >
      <div
        style={{
          width: config.width,
          height: config.height,
          transform: `scale(${scale})`,
          transformOrigin: "center",
          position: "relative",
          flex: "0 0 auto",
          boxShadow: "0 20px 80px rgba(0,0,0,0.6)",
        }}
      >
        {renderSlide(slide, lastFrame, config.fps, theme)}
        {slide.elements.map((el) => (
          <div
            key={el.id}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(el.id);
            }}
            style={{
              position: "absolute",
              left: el.x,
              top: el.y,
              width: el.w,
              height: el.h,
              cursor: "pointer",
              outline:
                selectedId === el.id ? "3px solid #6366f1" : "1px dashed rgba(255,255,255,0.18)",
              outlineOffset: 3,
            }}
          />
        ))}
      </div>
    </div>
  );
};
