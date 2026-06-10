import { useEffect, useRef, useState, type CSSProperties } from "react";
import { renderSlide } from "../SlideRenderer.js";
import type { ResolvedTheme, SlideElement, SlideJson } from "../schema.js";
import { uploadAsset } from "./api.js";
import { useSize } from "./useSize.js";

type Orig = { x: number; y: number; w: number; h: number };
type HandleDir = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
type Drag = { ids: string[]; mode: "move" | "resize"; primary: string; px: number; py: number; originals: Map<string, Orig>; handle?: HandleDir };
type Menu = { x: number; y: number; id: string };

const SNAP = 8;
const menuItem = (danger?: boolean): CSSProperties => ({ padding: "7px 12px", fontSize: 13, borderRadius: 5, cursor: "pointer", color: danger ? "#ef6b7d" : "#e8e9ee" });

// 8-direction resize handles. hx/hy mark which edges a handle moves (-1 left/top, +1 right/bottom, 0 none).
const HANDLES: HandleDir[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const HANDLE_VEC: Record<HandleDir, { hx: -1 | 0 | 1; hy: -1 | 0 | 1 }> = {
  nw: { hx: -1, hy: -1 }, n: { hx: 0, hy: -1 }, ne: { hx: 1, hy: -1 },
  e: { hx: 1, hy: 0 }, se: { hx: 1, hy: 1 }, s: { hx: 0, hy: 1 },
  sw: { hx: -1, hy: 1 }, w: { hx: -1, hy: 0 },
};
const HANDLE_CURSOR: Record<HandleDir, string> = {
  nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize",
  n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize",
};
const handlePos = (dir: HandleDir): CSSProperties => {
  const s: CSSProperties = {};
  if (dir.includes("w")) s.left = -8; else if (dir.includes("e")) s.right = -8; else s.left = "calc(50% - 7px)";
  if (dir.includes("n")) s.top = -8; else if (dir.includes("s")) s.bottom = -8; else s.top = "calc(50% - 7px)";
  return s;
};

export const Canvas = ({
  slide,
  slideIndex,
  theme,
  config,
  selectedIds,
  onSelectIds,
  onChangeSlide,
  onCommit,
  onWheelNav,
}: {
  slide: SlideJson;
  slideIndex: number;
  theme: ResolvedTheme;
  config: { fps: number; width: number; height: number };
  selectedIds: string[];
  onSelectIds: (ids: string[]) => void;
  /** transient=true for an in-progress gesture step (collapses into one undo step). */
  onChangeSlide: (slide: SlideJson, transient?: boolean) => void;
  /** End the current drag/resize/typing gesture so it becomes one undo step. */
  onCommit: () => void;
  onWheelNav: (dir: -1 | 1) => void;
}) => {
  const { ref, size } = useSize();
  const scale = Math.min(size.w / config.width, size.h / config.height) || 1;
  const lastFrame = slide.durationInFrames - 1;
  const drag = useRef<Drag | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [menu, setMenu] = useState<Menu | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const clipboard = useRef<SlideElement[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);

  // Add an image element from a data URL, scaled to fit, centered at (cx,cy) in composition px.
  // The image is uploaded to assets/ and referenced by path (keeps deck.json small); if the
  // upload fails we fall back to embedding the data-URL inline.
  const addImage = (dataUrl: string, cx?: number, cy?: number) => {
    const img = new Image();
    img.onload = async () => {
      let w = img.naturalWidth || 640;
      let h = img.naturalHeight || 400;
      const k = Math.min(1, 900 / w, 700 / h);
      w = Math.round(w * k);
      h = Math.round(h * k);
      const x = Math.round((cx ?? config.width / 2) - w / 2);
      const y = Math.round((cy ?? config.height / 2) - h / 2);
      let src = dataUrl;
      try { src = await uploadAsset(dataUrl); } catch { /* keep data-URL fallback */ }
      const taken = new Set(slide.elements.map((e) => e.id));
      let id = "image";
      let n = 2;
      while (taken.has(id)) id = `image-${n++}`;
      onChangeSlide({ ...slide, elements: [...slide.elements, { id, type: "image", src, x, y, w, h, animation: { preset: "fade", start: 0 } }] });
      onSelectIds([id]);
    };
    img.src = dataUrl;
  };

  // Same as addImage but for a video (mp4/webm): reads its natural size from a <video>, uploads to
  // assets/, and inserts a `video` element (plays in the editor; OffthreadVideo on export).
  const addVideo = (dataUrl: string, cx?: number, cy?: number) => {
    const v = document.createElement("video");
    v.onloadedmetadata = async () => {
      let w = v.videoWidth || 1280;
      let h = v.videoHeight || 720;
      const k = Math.min(1, 900 / w, 700 / h);
      w = Math.round(w * k);
      h = Math.round(h * k);
      const x = Math.round((cx ?? config.width / 2) - w / 2);
      const y = Math.round((cy ?? config.height / 2) - h / 2);
      let src = dataUrl;
      try { src = await uploadAsset(dataUrl); } catch { /* keep data-URL fallback */ }
      const taken = new Set(slide.elements.map((e) => e.id));
      let id = "video";
      let n = 2;
      while (taken.has(id)) id = `video-${n++}`;
      onChangeSlide({ ...slide, elements: [...slide.elements, { id, type: "video", src, x, y, w, h, animation: { preset: "fade", start: 0 } }] });
      onSelectIds([id]);
    };
    v.src = dataUrl;
  };

  // Paste an image from the clipboard, or paste copied elements (Ctrl/Cmd+V).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const tag = document.activeElement?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const imageItem = [...(e.clipboardData?.items ?? [])].find((it) => it.type.startsWith("image/"));
      if (imageItem) {
        const file = imageItem.getAsFile();
        if (file) { e.preventDefault(); const reader = new FileReader(); reader.onload = () => addImage(reader.result as string); reader.readAsDataURL(file); }
        return;
      }
      if (clipboard.current.length) { e.preventDefault(); pasteEls(clipboard.current); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide]);

  // patchMany drives the live gesture interactions (drag, resize, inline typing),
  // so its updates are transient — the gesture collapses into one undo step.
  const patchMany = (patches: Array<{ id: string } & Record<string, unknown>>) => {
    const map = new Map(patches.map((p) => [p.id, p]));
    onChangeSlide({ ...slide, elements: slide.elements.map((e) => (map.has(e.id) ? ({ ...e, ...map.get(e.id) } as SlideElement) : e)) }, true);
  };

  // z-order / duplicate / delete (right-click menu).
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
  const uniqueIds = (base: string, taken: Set<string>) => {
    let id = `${base}-copy`;
    let n = 2;
    while (taken.has(id)) id = `${base}-copy-${n++}`;
    taken.add(id);
    return id;
  };
  const pasteEls = (src: SlideElement[]) => {
    const taken = new Set(slide.elements.map((e) => e.id));
    const copies = src.map((el) => ({ ...el, id: uniqueIds(el.id, taken), x: el.x + 24, y: el.y + 24 }));
    onChangeSlide({ ...slide, elements: [...slide.elements, ...copies] });
    onSelectIds(copies.map((c) => c.id));
  };
  const removeIds = (ids: string[]) => {
    onChangeSlide({ ...slide, elements: slide.elements.filter((e) => !ids.includes(e.id)) });
    onSelectIds([]);
  };

  // Copy a human + Claude-friendly reference to an element (slide number + ids + type, and the
  // image src if any) so it can be pasted into the chat to point Claude at exactly this box.
  // navigator.clipboard only exists in secure contexts (https / localhost); over plain http to a
  // remote IP it's undefined, so fall back to the legacy execCommand path.
  const copyText = (text: string) => {
    const legacy = () => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      document.body.removeChild(ta);
      if (ok) { flash("reference copied"); return; }
      // Last resort (clipboard blocked AND execCommand failed): show a prompt pre-filled with the
      // text so the user can copy it manually with Ctrl/⌘+C.
      window.prompt("Copy this reference (Ctrl/⌘+C, Enter):", text);
      flash("reference ready to copy");
    };
    const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 1600); };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => flash("reference copied")).catch(legacy);
    } else {
      legacy();
    }
  };
  const copyRef = (id: string) => {
    const el = slide.elements.find((e) => e.id === id);
    const kind = el?.type ?? "element";
    const extra = el && (el.type === "image" || el.type === "video") ? ` src=${el.src}` : "";
    copyText(`slide #${slideIndex + 1} "${slide.id}" › element "${id}" (${kind})${extra}`);
  };

  // Keyboard: arrow-nudge selected, Ctrl/Cmd+C/V/D, Delete/Backspace.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const sel = slide.elements.filter((x) => selectedIds.includes(x.id));
      if (["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(k)) {
        if (!sel.length) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = k === "arrowleft" ? -step : k === "arrowright" ? step : 0;
        const dy = k === "arrowup" ? -step : k === "arrowdown" ? step : 0;
        // Transient: a burst of nudges (held key / rapid taps) collapses into one
        // undo step, committed on key release.
        onChangeSlide({ ...slide, elements: slide.elements.map((el) => (selectedIds.includes(el.id) ? { ...el, x: el.x + dx, y: el.y + dy } : el)) }, true);
      } else if (mod && k === "c") {
        if (sel.length) clipboard.current = sel;
      } else if (mod && k === "d") {
        if (sel.length) { e.preventDefault(); pasteEls(sel); }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (sel.length) { e.preventDefault(); removeIds(selectedIds); }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(e.key.toLowerCase())) onCommit();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKeyUp); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, slide]);

  const begin = (e: React.PointerEvent, el: SlideElement, mode: "move" | "resize", handle?: HandleDir) => {
    if (editing) return;
    e.stopPropagation();
    e.preventDefault();
    setMenu(null);

    let ids: string[];
    if (mode === "resize") {
      ids = [el.id];
    } else if (e.shiftKey) {
      ids = selectedIds.includes(el.id) ? selectedIds.filter((x) => x !== el.id) : [...selectedIds, el.id];
      onSelectIds(ids);
      if (!ids.includes(el.id)) return; // shift-deselected; don't drag
    } else {
      ids = selectedIds.includes(el.id) ? selectedIds : [el.id];
      if (!selectedIds.includes(el.id)) onSelectIds([el.id]);
    }

    const originals = new Map(slide.elements.filter((x) => ids.includes(x.id)).map((x) => [x.id, { x: x.x, y: x.y, w: x.w, h: x.h }]));
    drag.current = { ids, mode, primary: el.id, px: e.clientX, py: e.clientY, originals, handle };
    const others = slide.elements.filter((o) => !ids.includes(o.id));
    const xT = [config.width / 2, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])];
    const yT = [config.height / 2, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])];

    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const po = d.originals.get(d.primary) as Orig;
      let rawDx = Math.round((ev.clientX - d.px) / scale);
      let rawDy = Math.round((ev.clientY - d.py) / scale);
      if (d.mode === "resize") {
        // Per-handle resize. Shift = aspect-lock; Ctrl/Cmd = resize about the center (anchor fixed).
        const hv = HANDLE_VEC[d.handle ?? "se"];
        const fromCenter = ev.ctrlKey || ev.metaKey;
        const dW = hv.hx * rawDx; // width growth along the drag direction
        const dH = hv.hy * rawDy;
        let w = po.w + (fromCenter ? 2 * dW : dW);
        let h = po.h + (fromCenter ? 2 * dH : dH);
        if (ev.shiftKey && po.w > 0 && po.h > 0) {
          const ratio = po.w / po.h;
          if (hv.hx !== 0 && hv.hy === 0) h = w / ratio;        // horizontal edge handle drives width
          else if (hv.hy !== 0 && hv.hx === 0) w = h * ratio;   // vertical edge handle drives height
          else if (Math.abs(dW) >= Math.abs(dH)) h = w / ratio; // corner: dominant axis
          else w = h * ratio;
        }
        w = Math.max(20, Math.round(w));
        h = Math.max(20, Math.round(h));
        let x = po.x;
        let y = po.y;
        if (fromCenter) {
          x = Math.round(po.x + po.w / 2 - w / 2);
          y = Math.round(po.y + po.h / 2 - h / 2);
        } else {
          if (hv.hx === -1) x = Math.round(po.x + po.w - w); // dragging left edge → right edge fixed
          if (hv.hy === -1) y = Math.round(po.y + po.h - h); // dragging top edge → bottom edge fixed
        }
        patchMany([{ id: d.primary, x, y, w, h }]);
        return;
      }
      // Hold Shift to constrain movement to the dominant axis (skip snapping then).
      const axisLock = ev.shiftKey;
      if (axisLock) { if (Math.abs(rawDx) >= Math.abs(rawDy)) rawDy = 0; else rawDx = 0; }
      let nx = po.x + rawDx;
      let ny = po.y + rawDy;
      const gx: number[] = [];
      const gy: number[] = [];
      if (!axisLock) {
        for (const off of [0, po.w / 2, po.w]) { const t = xT.find((v) => Math.abs(nx + off - v) <= SNAP); if (t !== undefined) { nx = Math.round(t - off); gx.push(t); break; } }
        for (const off of [0, po.h / 2, po.h]) { const t = yT.find((v) => Math.abs(ny + off - v) <= SNAP); if (t !== undefined) { ny = Math.round(t - off); gy.push(t); break; } }
      }
      const ddx = nx - po.x;
      const ddy = ny - po.y;
      patchMany(d.ids.map((id) => { const o = d.originals.get(id) as Orig; return { id, x: o.x + ddx, y: o.y + ddy }; }));
      setGuides({ x: gx, y: gy });
    };
    const up = () => {
      drag.current = null;
      setGuides({ x: [], y: [] });
      onCommit(); // close the gesture → one undo step for the whole drag/resize
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Bounding box of the current multi-selection (≥2), for the group-resize handle.
  const selEls = slide.elements.filter((e) => selectedIds.includes(e.id));
  const gbb =
    selEls.length >= 2
      ? {
          minX: Math.min(...selEls.map((e) => e.x)),
          minY: Math.min(...selEls.map((e) => e.y)),
          maxX: Math.max(...selEls.map((e) => e.x + e.w)),
          maxY: Math.max(...selEls.map((e) => e.y + e.h)),
        }
      : null;

  // Drag the group handle to scale the whole selection about its top-left corner.
  // Hold Shift for a uniform (aspect-locked) scale.
  const beginGroupResize = (e: React.PointerEvent) => {
    if (!gbb) return;
    e.stopPropagation();
    e.preventDefault();
    setMenu(null);
    const ids = selectedIds;
    const originals = new Map(selEls.map((x) => [x.id, { x: x.x, y: x.y, w: x.w, h: x.h }]));
    const gw = gbb.maxX - gbb.minX;
    const gh = gbb.maxY - gbb.minY;
    const px = e.clientX;
    const py = e.clientY;
    const move = (ev: PointerEvent) => {
      let sx = gw > 0 ? (gw + (ev.clientX - px) / scale) / gw : 1;
      let sy = gh > 0 ? (gh + (ev.clientY - py) / scale) / gh : 1;
      if (ev.shiftKey) { const s = Math.max(sx, sy); sx = s; sy = s; }
      sx = Math.max(0.05, sx);
      sy = Math.max(0.05, sy);
      patchMany(
        ids.map((id) => {
          const o = originals.get(id) as Orig;
          return {
            id,
            x: Math.round(gbb.minX + (o.x - gbb.minX) * sx),
            y: Math.round(gbb.minY + (o.y - gbb.minY) * sy),
            w: Math.max(20, Math.round(o.w * sx)),
            h: Math.max(20, Math.round(o.h * sy)),
          };
        }),
      );
    };
    const up = () => {
      onCommit();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={ref}
      onPointerDown={() => { onSelectIds([]); setMenu(null); }}
      onWheel={(e) => { if (Math.abs(e.deltaY) > 8) onWheelNav(e.deltaY > 0 ? 1 : -1); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
        if (!file) return;
        const rect = stageRef.current?.getBoundingClientRect();
        const cx = rect ? (e.clientX - rect.left) / scale : undefined;
        const cy = rect ? (e.clientY - rect.top) / scale : undefined;
        const isVideo = file.type.startsWith("video/");
        const reader = new FileReader();
        reader.onload = () => (isVideo ? addVideo : addImage)(reader.result as string, cx, cy);
        reader.readAsDataURL(file);
      }}
      style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "#06070b" }}
    >
      <div ref={stageRef} style={{ width: config.width, height: config.height, transform: `scale(${scale})`, transformOrigin: "center", position: "relative", flex: "0 0 auto", boxShadow: "0 20px 80px rgba(0,0,0,0.6)" }}>
        {/* While inline-editing a text element, omit it from the background render so the
            live <textarea> doesn't show a stale duplicate behind it (no ghost). */}
        {renderSlide(editing ? { ...slide, elements: slide.elements.filter((e) => e.id !== editing) } : slide, lastFrame, config.fps, theme)}

        {slide.elements.map((el) => {
          const active = selectedIds.includes(el.id);
          const box = { position: "absolute" as const, left: el.x, top: el.y, width: el.w, height: el.h };

          if (editing === el.id && el.type === "text") {
            const s = el.style ?? {};
            return (
              <textarea
                key={el.id}
                autoFocus
                value={el.text}
                onChange={(e) => patchMany([{ id: el.id, text: e.target.value }])}
                onBlur={() => { setEditing(null); onCommit(); }}
                onKeyDown={(e) => { if (e.key === "Escape") e.currentTarget.blur(); }}
                onPointerDown={(e) => e.stopPropagation()}
                style={{ ...box, resize: "none", border: "2px solid #6366f1", background: "rgba(6,7,11,0.55)", color: s.color ?? theme.text, fontFamily: s.fontFamily ?? theme.font, fontSize: s.fontSize ?? 40, fontWeight: s.fontWeight ?? 400, fontStyle: s.italic ? "italic" : "normal", textDecoration: s.underline ? "underline" : "none", letterSpacing: s.letterSpacing, lineHeight: s.lineHeight ?? 1.2, textAlign: s.align ?? "left", padding: 0, outline: "none" }}
              />
            );
          }

          return (
            <div
              key={el.id}
              onPointerDown={(e) => begin(e, el, "move")}
              onDoubleClick={(e) => { if (el.type === "text") { e.stopPropagation(); onSelectIds([el.id]); setEditing(el.id); } }}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onSelectIds([el.id]); setMenu({ x: e.clientX, y: e.clientY, id: el.id }); }}
              style={{ ...box, cursor: "move", outline: active ? "3px solid #6366f1" : "1px dashed rgba(255,255,255,0.18)", outlineOffset: 3 }}
            >
              {active && selectedIds.length === 1 && HANDLES.map((dir) => (
                <div
                  key={dir}
                  onPointerDown={(e) => begin(e, el, "resize", dir)}
                  style={{ position: "absolute", ...handlePos(dir), width: 14, height: 14, borderRadius: 3, background: "#6366f1", border: "2px solid #fff", cursor: HANDLE_CURSOR[dir] }}
                />
              ))}
            </div>
          );
        })}

        {gbb && (
          <div style={{ position: "absolute", left: gbb.minX, top: gbb.minY, width: gbb.maxX - gbb.minX, height: gbb.maxY - gbb.minY, outline: "1px solid rgba(99,102,241,0.6)", pointerEvents: "none", zIndex: 40 }}>
            <div onPointerDown={beginGroupResize} style={{ position: "absolute", right: -8, bottom: -8, width: 16, height: 16, borderRadius: 3, background: "#6366f1", border: "2px solid #fff", cursor: "nwse-resize", pointerEvents: "auto" }} />
          </div>
        )}

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
              ["Copy reference id", () => copyRef(menu.id)],
              ["Bring to front", () => arrange(menu.id, "front")],
              ["Bring forward", () => arrange(menu.id, "forward")],
              ["Send backward", () => arrange(menu.id, "backward")],
              ["Send to back", () => arrange(menu.id, "back")],
              ["Duplicate", () => pasteEls(slide.elements.filter((e) => e.id === menu.id))],
              ["Delete", () => removeIds([menu.id])],
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

      {toast && (
        <div style={{ position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)", zIndex: 300, background: "#15171f", color: "#e8e9ee", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 8, padding: "8px 16px", fontSize: 13, boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>
          {toast}
        </div>
      )}
    </div>
  );
};
