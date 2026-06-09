// Browser/client entry. Safe to import in a React app — no Node-only dependencies.
export { SlideDeck, type SlideDeckProps } from "./SlideDeck";
export { makeDeckRoot, registerDeck } from "./registerDeck";
export {
  DEFAULT_DECK_CONFIG,
  resolveConfig,
  type DeckConfig,
  type SlideDef,
} from "./types";

// The PDF renderer lives in the Node-only entry to keep @remotion/bundler and
// @remotion/renderer out of browser bundles:
//   import { renderDeckToPdf } from "remotion-deck/node";
