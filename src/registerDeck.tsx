import { Composition, registerRoot } from "remotion";
import { resolveConfig, type DeckConfig, type SlideDef } from "./types";

/**
 * Build a Remotion Root component that registers every slide as a <Composition>.
 * Use this when you want to embed the deck inside a larger Remotion root.
 */
export const makeDeckRoot = (
  slides: SlideDef[],
  config?: Partial<DeckConfig>,
) => {
  const { fps, width, height } = resolveConfig(config);
  return function DeckRoot() {
    return (
      <>
        {slides.map((slide) => (
          <Composition
            key={slide.id}
            id={slide.id}
            component={slide.component}
            durationInFrames={slide.durationInFrames}
            fps={fps}
            width={width}
            height={height}
          />
        ))}
      </>
    );
  };
};

/**
 * Register a deck as the Remotion root. Call this from your Remotion entry file
 * (the entryPoint you pass to renderDeckToPdf), e.g.:
 *
 *   import { registerDeck } from "remotion-deck";
 *   import { SLIDES } from "./deck";
 *   registerDeck(SLIDES);
 */
export const registerDeck = (
  slides: SlideDef[],
  config?: Partial<DeckConfig>,
): void => {
  registerRoot(makeDeckRoot(slides, config));
};
