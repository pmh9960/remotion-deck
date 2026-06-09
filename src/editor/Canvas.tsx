import { useRef, useState } from "react";
import { renderSlide } from "../SlideRenderer.js";
import type { ResolvedTheme, SlideElement, SlideJson } from "../schema.js";
import { useSize } from "./useSize.js";

type Drag = { id: string; mode: "move" | "resize"; px: number; py: number; ox: number; oy: number; ow: number; oh: number };

/** Renders the slide at its final frame inside a fitted 1920×1080 stage. Click to
 *  select, drag to move, corner handle to resize, double-click text to edit inline.
 *  Geometry/text edits write back through onChangeSlide (which debounce-saves). */
export const Canvas = ({
  slide,
  theme,
  config,
  selectedId,
  onSelect,
  onChangeSlide,
}: {
  slide: SlideJson;
  theme: ResolvedTheme;
  config: { fps: number; width: number; height: number };
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChangeSlide: (slide: SlideJson) => void;
}) => {
  const { ref, size } = useSize();
  const scale = Math.min(size.w / config.width, size.h / config.height) || 1;
  const lastFrame = slide.durationInFrames - 1;
  const drag = useRef<Drag | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const patch = (id: string, next: Partial<SlideElement>) =>
    onChangeSlide({ ...slide, elements: slide.elements.map((e) => (e.id === id ? ({ ...e, ...next } as SlideElement) : e)) });

  const begin = (e: React.PointerEvent, el: SlideElement, mode: "move" | "resize") => {
    if (editing) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(el.id);
    drag.current = { id: el.id, mode, px: e.clientX, py: e.clientY, ox: el.x, oy: el.y, ow: el.w, oh: el.h };
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = Math.round((ev.clientX - d.px) / scale);
      const dy = Math.round((ev.clientY - d.py) / scale);
      if (d.mode === "move") patch(d.id, { x: d.ox + dx, y: d.oy + dy });
      else patch(d.id, { w: Math.max(20, d.ow + dx), h: Math.max(20, d.oh + dy) });
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div ref={ref} onPointerDown={() => onSelect(null)} style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "#06070b" }}>
      <div style={{ width: config.width, height: config.height, transform: `scale(${scale})`, transformOrigin: "center", position: "relative", flex: "0 0 auto", boxShadow: "0 20px 80px rgba(0,0,0,0.6)" }}>
        {renderSlide(slide, lastFrame, config.fps, theme)}
        {slide.elements.map((el) => {
          const active = selectedId === el.id;
          const box = { position: "absolute" as const, left: el.x, top: el.y, width: el.w, height: el.h };

          if (editing === el.id && el.type === "text") {
            const s = el.style ?? {};
            return (
              <textarea
                key={el.id}
                autoFocus
                value={el.text}
                onChange={(e) => patch(el.id, { text: e.target.value } as Partial<SlideElement>)}
                onBlur={() => setEditing(null)}
                onKeyDown={(e) => { if (e.key === "Escape") e.currentTarget.blur(); }}
                onPointerDown={(e) => e.stopPropagation()}
                style={{ ...box, resize: "none", border: "2px solid #6366f1", background: "rgba(6,7,11,0.55)", color: s.color ?? theme.text, fontFamily: s.fontFamily ?? theme.font, fontSize: s.fontSize ?? 40, fontWeight: s.fontWeight ?? 400, lineHeight: s.lineHeight ?? 1.2, textAlign: s.align ?? "left", padding: 0, outline: "none" }}
              />
            );
          }

          return (
            <div
              key={el.id}
              onPointerDown={(e) => begin(e, el, "move")}
              onDoubleClick={(e) => { if (el.type === "text") { e.stopPropagation(); onSelect(el.id); setEditing(el.id); } }}
              style={{ ...box, cursor: "move", outline: active ? "3px solid #6366f1" : "1px dashed rgba(255,255,255,0.18)", outlineOffset: 3 }}
            >
              {active && (
                <div onPointerDown={(e) => begin(e, el, "resize")} style={{ position: "absolute", right: -8, bottom: -8, width: 16, height: 16, borderRadius: 3, background: "#6366f1", border: "2px solid #fff", cursor: "nwse-resize" }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
