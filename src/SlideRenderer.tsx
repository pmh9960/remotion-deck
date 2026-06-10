import type { CSSProperties } from "react";
import { OffthreadVideo, useCurrentFrame, useVideoConfig } from "remotion";

/** "html" → plain <video> (works anywhere, incl. the editor canvas); "offthread" → Remotion's
 *  OffthreadVideo (frame-accurate, captured by PDF/HTML export — only valid inside Remotion). */
type VideoMode = "html" | "offthread";
import { computeElementStyle } from "./animations.js";
import {
  resolveTheme,
  type Background,
  type ResolvedTheme,
  type SlideElement,
  type SlideJson,
  type ThemeJson,
} from "./schema.js";

const backgroundStyle = (bg: Background | undefined, theme: ResolvedTheme): CSSProperties => {
  if (!bg) return { background: theme.bg };
  if (typeof bg === "string") return { background: bg };
  if (bg.type === "radial") {
    return { background: `radial-gradient(1200px 700px at ${bg.at ?? "20% 0%"}, ${bg.from}, ${bg.to})` };
  }
  return { background: `linear-gradient(${bg.at ?? "180deg"}, ${bg.from}, ${bg.to})` };
};

const ElementView = ({
  el,
  frame,
  fps,
  theme,
  videoMode,
}: {
  el: SlideElement;
  frame: number;
  fps: number;
  theme: ResolvedTheme;
  videoMode: VideoMode;
}) => {
  const a = computeElementStyle(el, frame, fps);
  const box: CSSProperties = {
    position: "absolute",
    left: el.x,
    top: el.y,
    width: el.w,
    height: el.h,
    opacity: a.opacity,
    transform: a.transform,
  };

  if (el.type === "image") {
    return (
      <img
        src={el.src}
        style={{ ...box, objectFit: el.style?.objectFit ?? "contain", borderRadius: el.style?.borderRadius }}
      />
    );
  }

  if (el.type === "video") {
    const vstyle: CSSProperties = { ...box, objectFit: el.style?.objectFit ?? "contain", borderRadius: el.style?.borderRadius };
    return videoMode === "offthread" ? (
      <OffthreadVideo src={el.src} muted style={vstyle} />
    ) : (
      <video src={el.src} style={vstyle} autoPlay muted loop playsInline />
    );
  }

  if (el.type === "shape") {
    const pill = el.shape === "pill";
    return (
      <div
        style={{
          ...box,
          background:
            el.style?.background ?? `linear-gradient(135deg, ${theme.accent1}, ${theme.accent2})`,
          borderRadius: pill ? 999 : el.style?.borderRadius ?? 0,
        }}
      />
    );
  }

  // text
  const s = el.style ?? {};
  const gradient = s.gradientText
    ? {
        background: `linear-gradient(90deg, ${theme.accent1}, ${theme.accent2})`,
        WebkitBackgroundClip: "text" as const,
        backgroundClip: "text" as const,
        WebkitTextFillColor: "transparent" as const,
        color: "transparent",
      }
    : { color: s.color ?? theme.text };
  const shown =
    a.textRevealFrac >= 1
      ? el.text
      : el.text.slice(0, Math.round(el.text.length * a.textRevealFrac));

  return (
    <div
      style={{
        ...box,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        fontFamily: s.fontFamily ?? theme.font,
        fontSize: s.fontSize ?? 40,
        fontWeight: s.fontWeight ?? 400,
        lineHeight: s.lineHeight ?? 1.2,
        letterSpacing: s.letterSpacing,
        textAlign: s.align ?? "left",
        fontStyle: s.italic ? "italic" : "normal",
        textDecoration: s.underline ? "underline" : "none",
        textTransform: s.uppercase ? "uppercase" : "none",
        whiteSpace: "pre-wrap",
        ...gradient,
      }}
    >
      {shown}
    </div>
  );
};

/** Pure render of one slide at a given frame. Used by both the Remotion
 *  SlideRenderer (present + PDF) and the editor canvas (no Remotion context). */
export const renderSlide = (
  slide: SlideJson,
  frame: number,
  fps: number,
  theme: ResolvedTheme,
  videoMode: VideoMode = "html",
) => (
  <div style={{ position: "absolute", inset: 0, overflow: "hidden", ...backgroundStyle(slide.background, theme) }}>
    {slide.elements.map((el) => (
      <ElementView key={el.id} el={el} frame={frame} fps={fps} theme={theme} videoMode={videoMode} />
    ))}
  </div>
);

/** Remotion component: renders a JSON slide, frame-driven. Uses OffthreadVideo for video so it's
 *  frame-accurate and captured by PDF/HTML export. */
export const SlideRenderer = ({ slide, theme }: { slide: SlideJson; theme?: ThemeJson }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return renderSlide(slide, frame, fps, resolveTheme(theme), "offthread");
};
