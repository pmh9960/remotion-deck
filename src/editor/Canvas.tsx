import { useRef, useState } from "react";
import { renderSlide } from "../SlideRenderer.js";
import type { ResolvedTheme, SlideElement, SlideJson } from "../schema.js";
import { useSize } from "./useSize.js";

type Drag = { id: string; mode: "move" | "resize"; px: number; py: number; ox: number; oy: number; ow: number; oh: number };

const SNAP = 8; // composition px within which an edge snaps to a guide line

export const Canvas = ({
  slide,
  theme,
  config,
  selectedId,
  onSelect,
  onChangeSlide,
  onWheelNav,
}: {
  slide: SlideJson;
  theme: ResolvedTheme;
  config: { fps: number; width: number; height: number };
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChangeSlide: (slide: SlideJson) => void;
  onWheelNav: (dir: -1 | 1) => void;
}) => {
  const { ref, size } = useSize();
  const scale = Math.min(size.w / config.width, size.h / config.height) || 1;
  const lastFrame = slide.durationInFrames - 1;
  const drag = useRef<Drag | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });

  const patch = (id: string, next: Partial<SlideElement>) =>
    onChangeSlide({ ...slide, elements: slide.elements.map((e) => (e.id === id ? ({ ...e, ...next } as SlideElement) : e)) });

  const begin = (e: React.PointerEvent, el: SlideElement, mode: "move" | "resize") => {
    if (editing) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(el.id);
    drag.current = { id: el.id, mode, px: e.clientX, py: e.clientY, ox: el.x, oy: el.y, ow: el.w, oh: el.h };

    // Snap targets: every other element's left/center/right and top/center/bottom, plus canvas center.
    const others = slide.elements.filter((o) => o.id !== el.id);
    const xT = [config.width / 2, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])];
    const yT = [config.height / 2, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])];

    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = Math.round((ev.clientX - d.px) / scale);
      const dy = Math.round((ev.clientY - d.py) / scale);
      if (d.mode === "resize") {
        patch(d.id, { w: Math.max(20, d.ow + dx), h: Math.max(20, d.oh + dy) });
        return;
      }
      let nx = d.ox + dx;
      let ny = d.oy + dy;
      const gx: number[] = [];
      const gy: number[] = [];
      for (const off of [0, d.ow / 2, d.ow]) {
        const t = xT.find((v) => Math.abs(nx + off - v) <= SNAP);
        if (t !== undefined) { nx = Math.round(t - off); gx.push(t); break; }
      }
      for (const off of [0, d.oh / 2, d.oh]) {
        const t = yT.find((v) => Math.abs(ny + off - v) <= SNAP);
        if (t !== undefined) { ny = Math.round(t - off); gy.push(t); break; }
      }
      patch(d.id, { x: nx, y: ny });
      setGuides({ x: gx, y: gy });
    };
    const up = () => {
      drag.current = null;
      setGuides({ x: [], y: [] });
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={ref}
      onPointerDown={() => onSelect(null)}
      onWheel={(e) => { if (Math.abs(e.deltaY) > 8) onWheelNav(e.deltaY > 0 ? 1 : -1); }}
      style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "#06070b" }}
    >
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

        {guides.x.map((gx, i) => (
          <div key={`gx${i}`} style={{ position: "absolute", left: gx, top: 0, width: 1, height: config.height, background: "#ec4899", pointerEvents: "none", zIndex: 50 }} />
        ))}
        {guides.y.map((gy, i) => (
          <div key={`gy${i}`} style={{ position: "absolute", top: gy, left: 0, height: 1, width: config.width, background: "#ec4899", pointerEvents: "none", zIndex: 50 }} />
        ))}
      </div>
    </div>
  );
};
