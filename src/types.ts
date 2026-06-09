import type { ComponentType } from "react";

/** A single slide: a Remotion component plus how long its intro animation runs. */
export type SlideDef = {
  /** Unique, stable id. Becomes the Remotion composition id and the PDF bookmark. */
  id: string;
  /** A React component that may use Remotion hooks (useCurrentFrame, spring, …). */
  component: ComponentType;
  /** Length of this slide's intro animation, in frames. */
  durationInFrames: number;
};

/** Composition geometry shared across the whole deck. */
export type DeckConfig = {
  /** Frames per second. Default 30. */
  fps: number;
  /** Composition width in px. Default 1920. */
  width: number;
  /** Composition height in px. Default 1080. */
  height: number;
};

export const DEFAULT_DECK_CONFIG: DeckConfig = {
  fps: 30,
  width: 1920,
  height: 1080,
};

/** Resolve a partial config against the defaults. */
export const resolveConfig = (config?: Partial<DeckConfig>): DeckConfig => ({
  ...DEFAULT_DECK_CONFIG,
  ...config,
});
