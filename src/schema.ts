// The data model for a deck. A deck.json validates against DeckJson.
// This is the source of truth that BOTH the visual editor and Claude Code edit.

export type AnimationPreset =
  | "none"
  | "fade"
  | "rise"
  | "slide-left"
  | "slide-up"
  | "pop"
  | "typewriter";

export type ElementAnimation = {
  preset: AnimationPreset;
  /** Frame at which this element begins animating in. */
  start: number;
  /** Optional frame length; presets fall back to sensible defaults. */
  duration?: number;
};

export type ElementStyle = {
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: string;
  fontFamily?: string;
  italic?: boolean;
  underline?: boolean;
  uppercase?: boolean;
  /** Fill text with the theme's accent gradient instead of a solid color. */
  gradientText?: boolean;
  /** For shapes / pills. */
  background?: string;
  borderRadius?: number;
  /**
   * For images: how the image fills its w×h box (CSS object-fit).
   * Defaults to "contain" (whole image fits, no cropping; may letterbox if the
   * box aspect ratio differs from the image). Set "cover" to fill+crop instead.
   */
  objectFit?: "contain" | "cover" | "fill" | "none" | "scale-down";
};

type ElementBase = {
  id: string;
  /** Position and size in composition pixels (the config width/height space). */
  x: number;
  y: number;
  w: number;
  h: number;
  style?: ElementStyle;
  animation?: ElementAnimation;
  /**
   * Click-to-reveal step (a "build"/fragment). Elements with the same step appear together.
   * Omitted / 0 → revealed with the slide on entry (the common case — most slides leave this
   * unset so everything shows at once). 1, 2, … → revealed on the 1st, 2nd, … forward click,
   * each animating in, BEFORE the deck advances to the next slide. Use sparingly (a couple of
   * slides with 2–3 steps), not on every slide. Ignored in the editor canvas and PDF export
   * (both show every step fully built).
   */
  step?: number;
};

export type TextElement = ElementBase & { type: "text"; text: string; link?: string };
export type ImageElement = ElementBase & { type: "image"; src: string };
/** Video element. src is a data-URL / http(s) URL / project-relative assets/<file> (mp4/webm). */
export type VideoElement = ElementBase & { type: "video"; src: string };
export type ShapeElement = ElementBase & {
  type: "shape";
  shape?: "rect" | "pill" | "line";
};

export type SlideElement = TextElement | ImageElement | VideoElement | ShapeElement;

export type Background =
  | string
  | { type: "radial" | "linear"; from: string; to: string; at?: string };

export type SlideJson = {
  id: string;
  /** Length of this slide's intro animation, in frames. */
  durationInFrames: number;
  background?: Background;
  elements: SlideElement[];
};

export type ThemeJson = {
  accent1?: string;
  accent2?: string;
  text?: string;
  dim?: string;
  bg?: string;
  font?: string;
  /** Optional webfont stylesheet URL (e.g. a Google Fonts link). When set, the editor and HTML
   *  export load it so `font` can name a non-system family (incl. Korean fonts). */
  fontUrl?: string;
};

export type DeckConfigJson = {
  fps?: number;
  width?: number;
  height?: number;
  theme?: ThemeJson;
};

export type DeckJson = {
  config?: DeckConfigJson;
  slides: SlideJson[];
};

export type ResolvedTheme = Required<ThemeJson>;

/**
 * Project palette. The four vivid colors are for TEXT / emphasis; the matching soft tints (~15%
 * toward white) are for BLOCK / shape fills behind dark text. Default to blue; use the others
 * sparingly. (Authoring guidance lives in the skill.)
 *  - blue   #005abe  primary accent / positive   (use for almost everything)
 *  - red    #e6222e  secondary accent / negative (rare — warnings / "bad")
 *  - yellow #ffc000  baseline / incidental highlight (default baseline is gray; yellow when it must stand out)
 *  - green  #00b464  special-case accent          (the special one)
 */
export const PALETTE = {
  blue: "#005abe",
  red: "#e6222e",
  yellow: "#ffc000",
  green: "#00b464",
  blueSoft: "#d9e6f5",
  redSoft: "#fbdee0",
  yellowSoft: "#fff6d9",
  greenSoft: "#d9f4e8",
} as const;

export const DEFAULT_THEME: ResolvedTheme = {
  accent1: PALETTE.blue,
  accent2: "#3d86d6", // lighter blue — keeps the accent gradient (gradientText / shape fills) calmly blue
  text: "#1f2937",
  dim: "rgba(31, 41, 55, 0.55)",
  bg: "#ffffff",
  font: "Segoe UI, system-ui, -apple-system, sans-serif",
  fontUrl: "",
};

export const resolveTheme = (theme?: ThemeJson): ResolvedTheme => ({
  ...DEFAULT_THEME,
  ...theme,
});

export const resolveDeckConfig = (config?: DeckConfigJson) => ({
  fps: config?.fps ?? 30,
  width: config?.width ?? 1920,
  height: config?.height ?? 1080,
});

/** Validate and normalize an untrusted object into a DeckJson, throwing on error. */
export const parseDeck = (input: unknown): DeckJson => {
  if (!input || typeof input !== "object") throw new Error("deck must be an object");
  const deck = input as DeckJson;
  if (!Array.isArray(deck.slides)) throw new Error("deck.slides must be an array");
  deck.slides.forEach((s, i) => {
    if (!s || typeof s.id !== "string") throw new Error(`slides[${i}].id must be a string`);
    if (typeof s.durationInFrames !== "number") {
      throw new Error(`slides[${i}].durationInFrames must be a number`);
    }
    if (!Array.isArray(s.elements)) throw new Error(`slides[${i}].elements must be an array`);
  });
  return deck;
};
