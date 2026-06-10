import { useEffect, useRef, useState, type CSSProperties } from "react";
import { renderSlide } from "../SlideRenderer.js";
import type { ResolvedTheme, SlideElement, SlideJson } from "../schema.js";
import { useSize } from "./useSize.js";

type Drag = { id: string; mode: "move" | "resize"; px: number; py: number; ox: number; oy: number; ow: number; oh: number };
type Menu = { x: number; y: number; id: string };

const SNAP = 8; // composition px within which an edge snaps to a guide line

const menuItem = (danger?: boolean): CSSProperties => ({ padding: "7px 12px", fontSize: 13, borderRadius: 5, cursor: "pointer", color: danger ? "#ef6b7d" : "#e8e9ee" });

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
  const [menu, setMenu] = useState<Menu | null>(null);
  const clipboard = useRef<SlideElement | null>(null);

  const patch = (id: string, next: Partial<SlideElement>) =>
    onChangeSlide({ ...slide, elements: slide.elements.map((e) => (e.id === id ? ({ ...e, ...next } as SlideElement) : e)) });

  // z-order / duplicate / delete (used by the right-click menu).
  const arrange = (id: string, where: "front" | "back" | "forward" | "backward") => {
    const els = [...slide.elements];
    const i = els.findIndex((e) => e.id === id);
    if (i === -1) return;
    const [el] = els.splice(i, 1);
    if (where === "front") els.push(el);
    else if (where === "back") els.unshift(el);
    else if (where === "forward") els.splice(Math.min(els.length, i + 1), 0, el);
    else els.splice(Math.max(0, i - 1), 0, el);
    onChangeSlide({ ...slide, elements: els });
  };
  const duplicate = (id: string) => {
    const el = slide.elements.find((e) => e.id === id);
    if (!el) return;
    const ids = new Set(slide.elements.map((e) => e.id));
    let nid = `${id}-copy`;
    let n = 2;
    while (ids.has(nid)) nid = `${id}-copy-${n++}`;
    onChangeSlide({ ...slide, elements: [...slide.elements, { ...el, id: nid, x: el.x + 24, y: el.y + 24 }] });
    onSelect(nid);
  };
  const remove = (id: string) => {
    onChangeSlide({ ...slide, elements: slide.elements.filter((e) => e.id !== id) });
    onSelect(null);
  };
  const pasteEl = (src: SlideElement) => {
    const ids = new Set(slide.elements.map((e) => e.id));
    let nid = `${src.id}-copy`;
    let n = 2;
    while (ids.has(nid)) nid = `${src.id}-copy-${n++}`;
    onChangeSlide({ ...slide, elements: [...slide.elements, { ...src, id: nid, x: src.x + 24, y: src.y + 24 }] });
    onSelect(nid);
  };

  // Element clipboard: Ctrl/Cmd+C copy, +V paste, +D duplicate, Delete/Backspace remove.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const sel = selectedId ? slide.elements.find((x) => x.id === selectedId) : null;
      if (mod && k === "c") {
        if (sel) clipboard.current = sel;
      } else if (mod && k === "v") {
        if (clipboard.current) { e.preventDefault(); pasteEl(clipboard.current); }
      } else if (mod && k === "d") {
        if (sel) { e.preventDefault(); duplicate(sel.id); }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (sel) { e.preventDefault(); remove(sel.id); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, slide]);

  const begin = (e: React.PointerEvent, el: SlideElement, mode: "move" | "resize") => {
    if (editing) return;
    e.stopPropagation();
    e.preventDefault();
    setMenu(null);
    onSelect(el.id);
    drag.current = { id: el.id, mode, px: e.clientX, py: e.clientY, ox: el.x, oy: el.y, ow: el.w, oh: el.h };
    const others = slide.elements.filter((o) => o.id !== el.id);
    const xT = [config.width / 2, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])];
    const yT = [config.height / 2, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])];

    const moveHandler = (ev: PointerEvent) => {
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
      window.removeEventListener("pointermove", moveHandler);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", moveHandler);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={ref}
      onPointerDown={() => { onSelect(null); setMenu(null); }}
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
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onSelect(el.id); setMenu({ x: e.clientX, y: e.clientY, id: el.id }); }}
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

      {menu && (
        <>
          <div onPointerDown={() => setMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 200 }} />
          <div style={{ position: "fixed", left: menu.x, top: menu.y, zIndex: 201, background: "#15171f", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8, padding: 4, minWidth: 170, boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>
            {([
              ["Bring to front", () => arrange(menu.id, "front")],
              ["Bring forward", () => arrange(menu.id, "forward")],
              ["Send backward", () => arrange(menu.id, "backward")],
              ["Send to back", () => arrange(menu.id, "back")],
              ["Duplicate", () => duplicate(menu.id)],
              ["Delete", () => remove(menu.id)],
            ] as [string, () => void][]).map(([label, fn]) => (
              <div
                key={label}
                onClick={() => { fn(); setMenu(null); }}
                style={menuItem(label === "Delete")}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
