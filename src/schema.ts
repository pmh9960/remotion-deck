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
  uppercase?: boolean;
  /** Fill text with the theme's accent gradient instead of a solid color. */
  gradientText?: boolean;
  /** For shapes / pills. */
  background?: string;
  borderRadius?: number;
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
};

export type TextElement = ElementBase & { type: "text"; text: string };
export type ImageElement = ElementBase & { type: "image"; src: string };
export type ShapeElement = ElementBase & {
  type: "shape";
  shape?: "rect" | "pill" | "line";
};

export type SlideElement = TextElement | ImageElement | ShapeElement;

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

export const DEFAULT_THEME: ResolvedTheme = {
  accent1: "#6366f1",
  accent2: "#ec4899",
  text: "#f5f6fa",
  dim: "rgba(245, 246, 250, 0.6)",
  bg: "#0b0d12",
  font: "Segoe UI, system-ui, -apple-system, sans-serif",
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
