import { Player, type PlayerRef } from "@remotion/player";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { resolveConfig, type DeckConfig, type SlideDef } from "./types";

export type SlideDeckProps = {
  /** The ordered list of slides. Order == presentation order == PDF page order. */
  slides: SlideDef[];
  /** Composition geometry. Partial — missing fields fall back to 1920x1080 @ 30fps. */
  config?: Partial<DeckConfig>;
  /** Start on this slide index. Default 0. */
  initialIndex?: number;
  /** Called whenever the active slide changes. */
  onIndexChange?: (index: number) => void;
  /** Show the top gradient progress bar. Default true. */
  showProgress?: boolean;
  /** Show the "n / total" counter. Default true. */
  showCounter?: boolean;
  /** Advance to the next slide when the stage is clicked. Default true. */
  advanceOnClick?: boolean;
  className?: string;
  style?: CSSProperties;
};

/**
 * A self-contained presentation surface built on @remotion/player.
 *
 * Playback is driven by a requestAnimationFrame loop that calls
 * PlayerRef.seekTo() frame-by-frame, NOT by Player.play()/autoPlay. play()/autoPlay
 * can be silently blocked by the browser's media autoplay policy, which freezes the
 * deck on frame 0; seekTo() is a synchronous scrub API and is immune to that. Each
 * slide replays from frame 0 because the Player is remounted via `key` on change.
 */
export const SlideDeck = ({
  slides,
  config,
  initialIndex = 0,
  onIndexChange,
  showProgress = true,
  showCounter = true,
  advanceOnClick = true,
  className,
  style,
}: SlideDeckProps) => {
  const { fps, width, height } = resolveConfig(config);
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(0, initialIndex), Math.max(0, slides.length - 1)),
  );
  const playerRef = useRef<PlayerRef>(null);

  const go = useCallback(
    (delta: number) => {
      setIndex((prev) => {
        const next = Math.min(slides.length - 1, Math.max(0, prev + delta));
        return next;
      });
    },
    [slides.length],
  );

  useEffect(() => {
    onIndexChange?.(index);
  }, [index, onIndexChange]);

  // Drive the intro animation: seek the player forward each frame from time-elapsed.
  useEffect(() => {
    const slide = slides[index];
    if (!slide) return;
    const last = slide.durationInFrames - 1;
    let raf = 0;
    let start = 0;
    const tick = (now: number) => {
      if (start === 0) start = now;
      const frame = Math.min(last, Math.round(((now - start) / 1000) * fps));
      playerRef.current?.seekTo(frame);
      if (frame < last) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [index, slides, fps]);

  // Keyboard navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "Home") {
        setIndex(0);
      } else if (e.key === "End") {
        setIndex(slides.length - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, slides.length]);

  const slide = slides[index];
  if (!slide) return null;

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: advanceOnClick ? "pointer" : "default",
        overflow: "hidden",
        ...style,
      }}
      onClick={advanceOnClick ? () => go(1) : undefined}
    >
      {showProgress && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: 3,
            width: `${((index + 1) / slides.length) * 100}%`,
            background: "linear-gradient(90deg, #6366f1, #ec4899)",
            transition: "width 0.35s ease",
            zIndex: 10,
          }}
        />
      )}
      <Player
        key={slide.id}
        ref={playerRef}
        component={slide.component}
        durationInFrames={slide.durationInFrames}
        fps={fps}
        compositionWidth={width}
        compositionHeight={height}
        // The Player fills the stage and letterboxes the composition internally,
        // keeping its aspect ratio centered regardless of the stage's shape.
        style={{ width: "100%", height: "100%" }}
        loop={false}
        controls={false}
        clickToPlay={false}
        doubleClickToFullscreen={false}
        acknowledgeRemotionLicense
      />
      {showCounter && (
        <div
          style={{
            position: "absolute",
            bottom: 22,
            right: 28,
            fontFamily: "system-ui, sans-serif",
            fontVariantNumeric: "tabular-nums",
            fontSize: 15,
            letterSpacing: "0.04em",
            color: "rgba(255,255,255,0.55)",
            background: "rgba(255,255,255,0.06)",
            padding: "6px 12px",
            borderRadius: 999,
            backdropFilter: "blur(6px)",
            userSelect: "none",
            zIndex: 10,
          }}
        >
          {index + 1} / {slides.length}
        </div>
      )}
    </div>
  );
};
