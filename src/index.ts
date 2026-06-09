// Browser/client entry. Safe to import in a React app — no Node-only dependencies.
// Relative imports carry explicit .js extensions so the emitted ESM is
// "fully specified" — required by Node's ESM loader AND by Remotion's webpack
// bundler when this package is consumed from its built dist.
export { SlideDeck, type SlideDeckProps } from "./SlideDeck.js";
export { makeDeckRoot, registerDeck } from "./registerDeck.js";
export {
  DEFAULT_DECK_CONFIG,
  resolveConfig,
  type DeckConfig,
  type SlideDef,
} from "./types.js";

// JSON data-model layer (drives the visual editor and Claude Code).
export { deckFromJson, type ResolvedDeck } from "./deckFromJson.js";
export { SlideRenderer, renderSlide } from "./SlideRenderer.js";
export { computeElementStyle, type ComputedAnimation } from "./animations.js";
export {
  parseDeck,
  resolveTheme,
  resolveDeckConfig,
  DEFAULT_THEME,
  type DeckJson,
  type SlideJson,
  type SlideElement,
  type TextElement,
  type ImageElement,
  type ShapeElement,
  type ElementStyle,
  type ElementAnimation,
  type AnimationPreset,
  type Background,
  type ThemeJson,
  type ResolvedTheme,
  type DeckConfigJson,
} from "./schema.js";

// The PDF renderer lives in the Node-only entry to keep @remotion/bundler and
// @remotion/renderer out of browser bundles:
//   import { renderDeckToPdf } from "remotion-deck/node";
