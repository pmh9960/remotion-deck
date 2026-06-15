import type { SlideDef } from "./types.js";
import { resolveDeckConfig, resolveTheme, type DeckConfigJson, type DeckJson } from "./schema.js";
import { SlideRenderer } from "./SlideRenderer.js";

export type ResolvedDeck = {
  config: { fps: number; width: number; height: number };
  slides: SlideDef[];
};

/** Bridge the JSON data model to the existing SlideDef API, so a deck.json drives
 *  the same <SlideDeck> (present) and renderDeckToPdf (PDF) paths as code slides.
 *
 *  `videoMode` is "offthread" by default (PDF). Pass "present" for the live deck / HTML export so
 *  videos are interactive (click-to-play). When SlideDeck drives the deck it passes a `revealStep`
 *  via Player inputProps, which the slide component forwards to enable click-to-reveal build steps. */
export const deckFromJson = (
  deck: DeckJson,
  videoMode: "offthread" | "present" = "offthread",
): ResolvedDeck => {
  const config = resolveDeckConfig(deck.config as DeckConfigJson | undefined);
  const theme = resolveTheme(deck.config?.theme);
  const slides: SlideDef[] = deck.slides.map((slide) => {
    const steps = slide.elements.reduce((m, el) => Math.max(m, el.step ?? 0), 0);
    return {
      id: slide.id,
      durationInFrames: slide.durationInFrames,
      steps,
      // Remotion passes Player inputProps as this component's props → revealStep (a number while
      // presenting, undefined for the PDF still-render → show every step fully built).
      component: (props: { revealStep?: number }) => (
        <SlideRenderer slide={slide} theme={theme} videoMode={videoMode} revealStep={props?.revealStep} />
      ),
    };
  });
  return { config, slides };
};
