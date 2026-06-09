import { interpolate, spring } from "remotion";
import type { SlideElement } from "./schema.js";

export type ComputedAnimation = {
  opacity: number;
  transform: string;
  /** For the "typewriter" preset: fraction (0..1) of characters to reveal. */
  textRevealFrac: number;
};

// spring() and interpolate() are pure functions (no React hooks), so this works
// both inside a Remotion render (frame from useCurrentFrame) and in the editor
// canvas (an explicit frame), which is why the editor needs no Player context.
export const computeElementStyle = (
  el: SlideElement,
  frame: number,
  fps: number,
): ComputedAnimation => {
  const anim = el.animation ?? { preset: "none" as const, start: 0 };
  const f = frame - (anim.start ?? 0);
  const none: ComputedAnimation = { opacity: 1, transform: "none", textRevealFrac: 1 };

  if (f < 0) return { opacity: 0, transform: "none", textRevealFrac: 0 };

  switch (anim.preset) {
    case "fade": {
      const o = interpolate(f, [0, anim.duration ?? 15], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      return { opacity: o, transform: "none", textRevealFrac: 1 };
    }
    case "rise": {
      const s = spring({ frame: f, fps, config: { damping: 18 } });
      return { opacity: s, transform: `translateY(${(1 - s) * 24}px)`, textRevealFrac: 1 };
    }
    case "slide-left": {
      const s = spring({ frame: f, fps, config: { damping: 18 } });
      return { opacity: s, transform: `translateX(${(1 - s) * -60}px)`, textRevealFrac: 1 };
    }
    case "slide-up": {
      const s = spring({ frame: f, fps, config: { damping: 18 } });
      return { opacity: s, transform: `translateY(${(1 - s) * 60}px)`, textRevealFrac: 1 };
    }
    case "pop": {
      const s = spring({ frame: f, fps, config: { damping: 12, mass: 0.6 } });
      return { opacity: Math.min(1, s * 1.2), transform: `scale(${0.8 + s * 0.2})`, textRevealFrac: 1 };
    }
    case "typewriter": {
      const frac = interpolate(f, [0, anim.duration ?? 30], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      return { opacity: 1, transform: "none", textRevealFrac: frac };
    }
    case "none":
    default:
      return none;
  }
};
