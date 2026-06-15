import { useState, type CSSProperties } from "react";
import { OffthreadVideo, useCurrentFrame, useVideoConfig } from "remotion";

/** "html" → plain autoplaying <video> (loops muted; for the editor canvas preview);
 *  "present" → interactive <video> with controls + click-to-play (for the live deck / HTML export);
 *  "offthread" → Remotion's OffthreadVideo (frame-accurate, captured by PDF — only valid in Remotion). */
type VideoMode = "html" | "present" | "offthread";

/** A very large frame: snaps a finished/earlier-step element to its final animated state. */
const SETTLED = 1_000_000;

/** Interactive video for the live deck: native controls (play/pause + scrubber + time), plus a big
 *  ▶ hint while paused. Clicking the video body toggles play (browser default); the control bar
 *  seeks. The wrapper carries `data-no-advance` so SlideDeck's click-to-advance skips clicks that
 *  land on the video (the Player renders the composition in its own React tree, so stopPropagation
 *  can't reach the outer handler — SlideDeck inspects the DOM target for this marker instead). */
const PresentVideo = ({ src, style }: { src: string; style: CSSProperties }) => {
  const [playing, setPlaying] = useState(false);
  return (
    <div data-no-advance style={{ ...style, cursor: "pointer", overflow: "hidden" }}>
      <video
        src={src}
        playsInline
        controls
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        style={{ width: "100%", height: "100%", objectFit: (style.objectFit as CSSProperties["objectFit"]) ?? "contain" }}
      />
      {!playing && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ width: 84, height: 84, borderRadius: 999, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 0, height: 0, borderTop: "16px solid transparent", borderBottom: "16px solid transparent", borderLeft: "26px solid #fff", marginLeft: 6 }} />
          </div>
        </div>
      )}
    </div>
  );
};
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
  revealStep,
}: {
  el: SlideElement;
  frame: number;
  fps: number;
  theme: ResolvedTheme;
  videoMode: VideoMode;
  /** undefined → no stepping (show every element at `frame`; editor + PDF). A number → gate by
   *  el.step: later steps hidden, earlier steps settled, the current step animating at `frame`. */
  revealStep?: number;
}) => {
  // Click-to-reveal gating. Only applies when revealStep is a number (the live deck / HTML export).
  let effFrame = frame;
  if (revealStep !== undefined) {
    const elStep = el.step ?? 0;
    if (elStep > revealStep) return null; // not revealed yet
    if (elStep < revealStep) effFrame = SETTLED; // already revealed in an earlier step → final state
  }
  const a = computeElementStyle(el, effFrame, fps);
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
    if (videoMode === "offthread") return <OffthreadVideo src={el.src} muted style={vstyle} />;
    if (videoMode === "present") return <PresentVideo src={el.src} style={vstyle} />;
    return <video src={el.src} style={vstyle} autoPlay muted loop playsInline />;
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

  const textStyle = {
    ...box,
    display: "flex",
    flexDirection: "column" as const,
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
    whiteSpace: "pre-wrap" as const,
    ...gradient,
  };
  // In the live deck (present), a text element with `link` renders as a real anchor: clicking opens
  // the URL (and `data-no-advance` keeps the slideshow from advancing), and the text stays
  // selectable/draggable. Editor canvas ("html") + PDF ("offthread") render plain text so element
  // selection/drag and frame-accurate export stay unaffected.
  if (el.link && videoMode === "present") {
    return (
      <a
        href={el.link}
        target="_blank"
        rel="noopener noreferrer"
        data-no-advance
        style={{ ...textStyle, pointerEvents: "auto", userSelect: "text", WebkitUserSelect: "text", cursor: "pointer" }}
      >
        {shown}
      </a>
    );
  }
  return <div style={textStyle}>{shown}</div>;
};

/** Pure render of one slide at a given frame. Used by both the Remotion
 *  SlideRenderer (present + PDF) and the editor canvas (no Remotion context). */
export const renderSlide = (
  slide: SlideJson,
  frame: number,
  fps: number,
  theme: ResolvedTheme,
  videoMode: VideoMode = "html",
  /** undefined → every element shown at `frame` (editor / PDF). A number → click-to-reveal gating. */
  revealStep?: number,
) => (
  <div style={{ position: "absolute", inset: 0, overflow: "hidden", ...backgroundStyle(slide.background, theme) }}>
    {slide.elements.map((el) => (
      <ElementView key={el.id} el={el} frame={frame} fps={fps} theme={theme} videoMode={videoMode} revealStep={revealStep} />
    ))}
  </div>
);

/** Remotion component: renders a JSON slide, frame-driven. `videoMode` defaults to "offthread"
 *  (PDF, frame-accurate). The live deck passes "present" + a `revealStep` (via Player inputProps)
 *  so videos are click-to-play and build steps reveal on click. `revealStep` undefined → show all. */
export const SlideRenderer = ({
  slide,
  theme,
  videoMode = "offthread",
  revealStep,
}: {
  slide: SlideJson;
  theme?: ThemeJson;
  videoMode?: VideoMode;
  revealStep?: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return renderSlide(slide, frame, fps, resolveTheme(theme), videoMode, revealStep);
};
