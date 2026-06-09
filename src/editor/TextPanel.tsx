import type { CSSProperties } from "react";
import type { SlideElement, SlideJson, TextElement } from "../schema.js";

const fieldLabel: CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "rgba(255,255,255,0.4)",
  marginBottom: 4,
};

/** Right panel: type the text for each text element on the current slide, plus the
 *  slide's intro duration. This is the per-slide "text entry space". */
export const TextPanel = ({
  slide,
  selectedId,
  onSelect,
  onChange,
}: {
  slide: SlideJson;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (slide: SlideJson) => void;
}) => {
  const setElement = (id: string, patch: Partial<SlideElement>) =>
    onChange({
      ...slide,
      elements: slide.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as SlideElement) : e)),
    });

  const texts = slide.elements.filter((e): e is TextElement => e.type === "text");

  return (
    <div style={{ width: 340, flex: "0 0 auto", overflowY: "auto", padding: 20, background: "#0d0f16", borderLeft: "1px solid rgba(255,255,255,0.06)", color: "#e8e9ee" }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Slide · {slide.id}</div>

      <div style={{ margin: "14px 0 22px" }}>
        <div style={fieldLabel}>Intro duration (frames)</div>
        <input
          type="number"
          value={slide.durationInFrames}
          onChange={(e) => onChange({ ...slide, durationInFrames: Math.max(1, Number(e.target.value) || 1) })}
          style={inputStyle}
        />
      </div>

      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>
        Text ({texts.length})
      </div>

      {texts.map((el) => {
        const active = el.id === selectedId;
        return (
          <div key={el.id} style={{ marginBottom: 16 }}>
            <div style={{ ...fieldLabel, color: active ? "#8b8df0" : fieldLabel.color }}>{el.id}</div>
            <textarea
              value={el.text}
              onFocus={() => onSelect(el.id)}
              onChange={(e) => setElement(el.id, { text: e.target.value })}
              rows={Math.min(6, Math.max(2, el.text.split("\n").length + 1))}
              style={{
                ...inputStyle,
                resize: "vertical",
                lineHeight: 1.4,
                outline: active ? "2px solid #6366f1" : "none",
              }}
            />
          </div>
        );
      })}

      {texts.length === 0 && (
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>No text elements on this slide.</div>
      )}
    </div>
  );
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#15171f",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 6,
  color: "#e8e9ee",
  fontSize: 13,
  padding: "8px 10px",
  fontFamily: "inherit",
};
