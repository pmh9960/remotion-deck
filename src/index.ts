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

// The PDF renderer lives in the Node-only entry to keep @remotion/bundler and
// @remotion/renderer out of browser bundles:
//   import { renderDeckToPdf } from "remotion-deck/node";
