import type { CSSProperties } from "react";
import type {
  AnimationPreset,
  ElementStyle,
  SlideElement,
  SlideJson,
  TextElement,
} from "../schema.js";

const PRESETS: AnimationPreset[] = ["none", "fade", "rise", "slide-left", "slide-up", "pop", "typewriter"];

const labelStyle: CSSProperties = { fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)", marginBottom: 4 };
const inputStyle: CSSProperties = { width: "100%", boxSizing: "border-box", background: "#15171f", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "#e8e9ee", fontSize: 13, padding: "7px 9px", fontFamily: "inherit" };

/** A toggle button (B / I / U / bullets) that highlights when active. */
const toggleStyle = (active: boolean, extra?: CSSProperties): CSSProperties => ({
  ...inputStyle,
  width: "auto",
  minWidth: 34,
  flex: "0 0 auto",
  cursor: "pointer",
  textAlign: "center",
  background: active ? "#3a3d72" : "#15171f",
  borderColor: active ? "#6366f1" : "rgba(255,255,255,0.12)",
  ...extra,
});

const BULLET = "•   ";
const isBulleted = (text: string): boolean => {
  const lines = text.split("\n").filter((l) => l.trim());
  return lines.length > 0 && lines.every((l) => /^•\s+/.test(l));
};
/** Toggle "•   " prefixes on every non-blank line. */
const toggleBullets = (text: string): string => {
  const on = isBulleted(text);
  return text
    .split("\n")
    .map((l) => (l.trim() ? (on ? l.replace(/^•\s+/, "") : /^•\s+/.test(l) ? l : BULLET + l) : l))
    .join("\n");
};

const Num = ({ label, value, onChange, onCommit }: { label: string; value: number; onChange: (n: number) => void; onCommit?: () => void }) => (
  <label style={{ flex: 1, minWidth: 0 }}>
    <div style={labelStyle}>{label}</div>
    <input type="number" value={Math.round(value)} onChange={(e) => onChange(Number(e.target.value) || 0)} onBlur={onCommit} style={inputStyle} />
  </label>
);

/** Right panel: per-slide text entry + an inspector for the selected element
 *  (position, text style, animation). Mirrors a slide editor's properties pane. */
export const TextPanel = ({
  slide,
  selectedId,
  onSelect,
  onChange,
  onCommit,
}: {
  slide: SlideJson;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** transient=true for live keystrokes (collapses into one undo step until onCommit). */
  onChange: (slide: SlideJson, transient?: boolean) => void;
  /** End the current edit (on blur, or after a one-shot button/select change). */
  onCommit: () => void;
}) => {
  // Edits are transient (a run of keystrokes = one undo step), closed by onCommit on blur.
  const set = (id: string, next: Partial<SlideElement>) =>
    onChange({ ...slide, elements: slide.elements.map((e) => (e.id === id ? ({ ...e, ...next } as SlideElement) : e)) }, true);
  const setStyle = (id: string, patch: ElementStyle, cur?: ElementStyle) => set(id, { style: { ...cur, ...patch } } as Partial<SlideElement>);
  // For one-shot controls (buttons, selects): apply then immediately close the step.
  const setOnce = (id: string, next: Partial<SlideElement>) => { set(id, next); onCommit(); };
  const setStyleOnce = (id: string, patch: ElementStyle, cur?: ElementStyle) => { setStyle(id, patch, cur); onCommit(); };

  const sel = slide.elements.find((e) => e.id === selectedId) ?? null;
  const texts = slide.elements.filter((e): e is TextElement => e.type === "text");

  return (
    <div style={{ width: 340, flex: "0 0 auto", overflowY: "auto", padding: 20, background: "#0d0f16", borderLeft: "1px solid rgba(255,255,255,0.06)", color: "#e8e9ee" }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Slide · {slide.id}</div>
      <div style={{ marginBottom: 22 }}>
        <div style={labelStyle}>Intro duration (frames)</div>
        <input type="number" value={slide.durationInFrames} onChange={(e) => onChange({ ...slide, durationInFrames: Math.max(1, Number(e.target.value) || 1) }, true)} onBlur={onCommit} style={inputStyle} />
      </div>

      {sel && (
        <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: "#8b8df0" }}>Element · {sel.id}</div>

          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <Num label="X" value={sel.x} onChange={(x) => set(sel.id, { x })} onCommit={onCommit} />
            <Num label="Y" value={sel.y} onChange={(y) => set(sel.id, { y })} onCommit={onCommit} />
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <Num label="W" value={sel.w} onChange={(w) => set(sel.id, { w })} onCommit={onCommit} />
            <Num label="H" value={sel.h} onChange={(h) => set(sel.id, { h })} onCommit={onCommit} />
          </div>

          {sel.type === "text" && (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <Num label="Font size" value={sel.style?.fontSize ?? 40} onChange={(fontSize) => setStyle(sel.id, { fontSize }, sel.style)} onCommit={onCommit} />
                <Num label="Weight" value={sel.style?.fontWeight ?? 400} onChange={(fontWeight) => setStyle(sel.id, { fontWeight }, sel.style)} onCommit={onCommit} />
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <button title="Bold" onClick={() => setStyleOnce(sel.id, { fontWeight: (sel.style?.fontWeight ?? 400) >= 700 ? 400 : 700 }, sel.style)} style={toggleStyle((sel.style?.fontWeight ?? 400) >= 700, { fontWeight: 800 })}>B</button>
                <button title="Italic" onClick={() => setStyleOnce(sel.id, { italic: !sel.style?.italic }, sel.style)} style={toggleStyle(!!sel.style?.italic, { fontStyle: "italic" })}>I</button>
                <button title="Underline" onClick={() => setStyleOnce(sel.id, { underline: !sel.style?.underline }, sel.style)} style={toggleStyle(!!sel.style?.underline, { textDecoration: "underline" })}>U</button>
                <button title="Bullet list" onClick={() => setOnce(sel.id, { text: toggleBullets(sel.text) })} style={toggleStyle(isBulleted(sel.text))}>• List</button>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <Num label="Line height ×100" value={Math.round((sel.style?.lineHeight ?? 1.2) * 100)} onChange={(v) => setStyle(sel.id, { lineHeight: Math.max(0.5, v / 100) }, sel.style)} onCommit={onCommit} />
                <label style={{ flex: 1, minWidth: 0 }}>
                  <div style={labelStyle}>Letter spacing</div>
                  <input value={sel.style?.letterSpacing ?? ""} placeholder="0.02em" onChange={(e) => setStyle(sel.id, { letterSpacing: e.target.value || undefined }, sel.style)} onBlur={onCommit} style={inputStyle} />
                </label>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={labelStyle}>Align</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["left", "center", "right"] as const).map((a) => (
                    <button key={a} onClick={() => setStyleOnce(sel.id, { align: a }, sel.style)} style={{ ...inputStyle, cursor: "pointer", background: (sel.style?.align ?? "left") === a ? "#2a2d3d" : "#15171f" }}>{a}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 4 }}>
                <div style={labelStyle}>Color</div>
                <input value={sel.style?.color ?? ""} placeholder="#f5f6fa" onChange={(e) => setStyle(sel.id, { color: e.target.value }, sel.style)} onBlur={onCommit} style={inputStyle} />
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <label style={{ flex: 1 }}>
              <div style={labelStyle}>Animation</div>
              <select value={sel.animation?.preset ?? "none"} onChange={(e) => setOnce(sel.id, { animation: { preset: e.target.value as AnimationPreset, start: sel.animation?.start ?? 0 } })} style={inputStyle}>
                {PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <Num label="Start" value={sel.animation?.start ?? 0} onChange={(start) => set(sel.id, { animation: { preset: sel.animation?.preset ?? "none", start } })} onCommit={onCommit} />
          </div>
        </div>
      )}

      <div style={{ ...labelStyle, marginBottom: 10 }}>Text ({texts.length})</div>
      {texts.map((el) => {
        const active = el.id === selectedId;
        return (
          <div key={el.id} style={{ marginBottom: 16 }}>
            <div style={{ ...labelStyle, color: active ? "#8b8df0" : labelStyle.color }}>{el.id}</div>
            <textarea
              value={el.text}
              onFocus={() => onSelect(el.id)}
              onChange={(e) => set(el.id, { text: e.target.value })}
              onBlur={onCommit}
              rows={Math.min(6, Math.max(2, el.text.split("\n").length + 1))}
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.4, outline: active ? "2px solid #6366f1" : "none" }}
            />
          </div>
        );
      })}
    </div>
  );
};
