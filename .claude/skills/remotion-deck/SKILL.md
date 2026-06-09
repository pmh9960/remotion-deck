---
name: remotion-deck
description: Create and edit Remotion-based presentation decks with the remotion-deck library — animated slides (useCurrentFrame/spring), arrow-key navigation, and PDF export. Use when the user wants to build a slide deck or presentation with Remotion, add or restyle slides, run the deck in the browser, or export it to PDF.
---

# remotion-deck

Build presentation decks where each slide is a Remotion composition. The library wraps
Remotion's public API: a `<SlideDeck>` React surface for presenting, `registerDeck` to expose
slides as compositions, and `renderDeckToPdf` to export. Remotion is a peerDependency, so the
deck tracks whatever Remotion version the project has installed.

## When to use this skill

- "Make a presentation / slide deck with Remotion"
- "Add a slide", "animate this slide", "restyle the title slide"
- "Run the deck", "export the deck to PDF"

## Project shape

A consumer project looks like this:

```
my-deck/
  package.json        # deps: remotion-deck remotion @remotion/player
                      #       dev: @remotion/bundler @remotion/renderer vite @vitejs/plugin-react
  index.html
  src/
    main.tsx          # ReactDOM root rendering <SlideDeck slides={SLIDES} config={DECK} />
    deck.tsx          # exports SLIDES: SlideDef[] and DECK: Partial<DeckConfig>
    slides/           # one component per slide (Remotion components)
    remotion-entry.ts # registerDeck(SLIDES, DECK)  -> used only for PDF export
  scripts/export-pdf.mjs  # calls renderDeckToPdf({ entryPoint, output })
```

If the project does not exist yet, scaffold it with Vite (react-ts) and add the deps above.

## The slide contract

A slide is `{ id: string; component: React.ComponentType; durationInFrames: number }`.
`durationInFrames` is the length of the slide's intro animation (the deck plays it from frame 0
on entry). Slides are plain Remotion components — use `useCurrentFrame`, `useVideoConfig`,
`interpolate`, `spring`, `AbsoluteFill`, etc.

```tsx
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export const Intro = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ background: "#0b0d12", color: "#fff", padding: 140, justifyContent: "center" }}>
      <div style={{ fontSize: 96, fontWeight: 800, opacity: enter, transform: `translateY(${interpolate(enter, [0, 1], [50, 0])}px)` }}>
        Title here
      </div>
    </AbsoluteFill>
  );
};
```

Register it in `deck.tsx`:

```tsx
import type { DeckConfig, SlideDef } from "remotion-deck";
import { Intro } from "./slides/Intro";

export const DECK: Partial<DeckConfig> = { fps: 30, width: 1920, height: 1080 };
export const SLIDES: SlideDef[] = [
  { id: "intro", component: Intro, durationInFrames: 90 },
];
```

Array order == presentation order == PDF page order.

## Presenting

`src/main.tsx`:

```tsx
import ReactDOM from "react-dom/client";
import { SlideDeck } from "remotion-deck";
import { DECK, SLIDES } from "./deck";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <SlideDeck slides={SLIDES} config={DECK} />,
);
```

Run with `vite`. Keys: → / Space / click = next, ← = prev, Home / End = first / last.
`SlideDeck` props: `slides`, `config`, `initialIndex`, `onIndexChange`, `showProgress`,
`showCounter`, `advanceOnClick`, `className`, `style`.

Do NOT wrap the root in `<React.StrictMode>` — its dev double-mount can interfere with the
player. (Playback is driven by `seekTo()` in a rAF loop, not `play()`/`autoPlay`, so it is not
affected by browser autoplay policy.)

## Exporting to PDF

`remotion-entry.ts` registers the deck:

```ts
import { registerDeck } from "remotion-deck";
import { DECK, SLIDES } from "./deck";
registerDeck(SLIDES, DECK);
```

`scripts/export-pdf.mjs`:

```js
import { renderDeckToPdf } from "remotion-deck/node";
await renderDeckToPdf({
  entryPoint: "src/remotion-entry.ts",
  output: "presentation.pdf",
  // frame: "last" (default = finished state) | number | (comp) => number
});
```

Run with `node scripts/export-pdf.mjs`. The first run downloads a headless browser (tens of
seconds). Each page is one slide's chosen frame at native resolution; PDF is static, so only a
snapshot is captured, not the animation.

## Verification (always do this before claiming done)

1. `tsc --noEmit` (or the project's typecheck) passes.
2. Run the dev server and confirm slide 1 renders and ← / → navigates (screenshot if a browser
   tool is available; a blank/black slide usually means the deck froze on frame 0).
3. For PDF work, run the export and confirm the PDF page count equals the slide count.

## Gotchas

- The PDF renderer passes `ignoreRegisterRootWarning` to Remotion's bundler because the entry
  calls `registerDeck` (which calls `registerRoot` indirectly) — this is expected.
- `@remotion/bundler` and `@remotion/renderer` are optional peers; only needed for PDF export.

## Licensing (mention to the user when distributing)

Remotion is NOT MIT — it is source-available and free for individuals, companies with up to 3
employees, and non-profits; larger companies need a paid Company License (remotion.pro). Using
remotion-deck means using Remotion, so this applies. See the repo's NOTICE / README.
