import type { SlideDef } from "./types.js";
import { resolveDeckConfig, resolveTheme, type DeckConfigJson, type DeckJson } from "./schema.js";
import { SlideRenderer } from "./SlideRenderer.js";

export type ResolvedDeck = {
  config: { fps: number; width: number; height: number };
  slides: SlideDef[];
};

/** Bridge the JSON data model to the existing SlideDef API, so a deck.json drives
 *  the same <SlideDeck> (present) and renderDeckToPdf (PDF) paths as code slides. */
export const deckFromJson = (deck: DeckJson): ResolvedDeck => {
  const config = resolveDeckConfig(deck.config as DeckConfigJson | undefined);
  const theme = resolveTheme(deck.config?.theme);
  const slides: SlideDef[] = deck.slides.map((slide) => ({
    id: slide.id,
    durationInFrames: slide.durationInFrames,
    component: () => <SlideRenderer slide={slide} theme={theme} />,
  }));
  return { config, slides };
};
