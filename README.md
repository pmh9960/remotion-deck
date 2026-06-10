# remotion-deck

**English** · [한국어](./README.ko.md)

Build **presentation decks with [Remotion](https://remotion.dev)** — frame-based slide
animations (`useCurrentFrame`, `spring`, …), arrow-key navigation, and one-command PDF export.

It is a **thin wrapper over Remotion's public API**. Remotion is a `peerDependency`, so the
deck rides along with whatever Remotion version your project installs — run `npm update remotion`
and you are on the new version, with no wrapper release required.

## Quick start: deck.json + visual editor

The fastest way to use it is **data, not code**: a single `deck.json` that the CLI edits
visually (PowerPoint-style), plays, and exports.

```bash
# Not yet on npm — install straight from GitHub (its prepare script builds on install).
npm i pmh9960/remotion-deck remotion @remotion/player
npm i -D @remotion/bundler @remotion/renderer   # only needed for PDF export

npx remotion-deck init      # scaffold deck.json (+ package.json)
npx remotion-deck dev       # open the visual editor
npx remotion-deck pdf       # → presentation.pdf   (or: html → self-contained .html)
```

In the editor: drag/resize (Shift = axis/aspect lock), multi-select + align/distribute, rich
text (B/I/U, bullets), insert shapes/images (paste or drop), per-action undo, and a chat box
that edits the deck. You and Claude edit the *same* `deck.json`.

### Claude Code skill

Installing the package does **not** install the skill (it's a Claude Code artifact). Add it with:

```bash
npx remotion-deck skill            # this project  → ./.claude/skills
npx remotion-deck skill --global   # all projects  → ~/.claude/skills
```

Then Claude can generate and restyle `deck.json` from a prompt.

### Headless / remote (Linux server)

`dev`, `present`, and `html` need no browser on the host — bind the network and open it remotely:

```bash
remotion-deck dev --host    # prints a Network URL; open it from any machine
```

Only `pdf` renders through a headless Chromium (Remotion auto-downloads it; on minimal Linux you
may need libs like `libnss3`/`libatk`). `html` is the dependency-free way to produce a shareable
artifact on a server.

## Install (library API)

For projects that import `SlideDeck`/`registerDeck` and write slides as React components:

```bash
npm i remotion-deck remotion @remotion/player   # or: pmh9960/remotion-deck while unpublished
# for PDF export you also need:
npm i -D @remotion/bundler @remotion/renderer
```

## Present (browser)

```tsx
import { SlideDeck, type SlideDef } from "remotion-deck";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";

const Hello = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity, color: "#fff", fontSize: 96 }}>Hello</AbsoluteFill>;
};

const SLIDES: SlideDef[] = [
  { id: "hello", component: Hello, durationInFrames: 60 },
  // …add more; array order == presentation order == PDF page order
];

export default () => <SlideDeck slides={SLIDES} config={{ fps: 30, width: 1920, height: 1080 }} />;
```

- **→ / Space / click** next · **←** prev · **Home / End** first / last
- Each slide replays its intro animation from frame 0 on entry.

> Playback is driven by `PlayerRef.seekTo()` in a `requestAnimationFrame` loop, not
> `play()`/`autoPlay` — the latter can be silently blocked by the browser's autoplay
> policy and freeze the deck on frame 0.

## Export to PDF

Create a Remotion entry that registers the deck:

```ts
// remotion-entry.ts
import { registerDeck } from "remotion-deck";
import { SLIDES, DECK } from "./deck";
registerDeck(SLIDES, DECK);
```

Then render (Node):

```ts
import { renderDeckToPdf } from "remotion-deck/node";

await renderDeckToPdf({
  entryPoint: "./remotion-entry.ts",
  output: "./presentation.pdf",
  // frame: "last" (default) | a number | (comp) => number
});
```

Each page is the chosen frame of a slide (default: the **last** frame, i.e. the finished
state) at the composition's native resolution. PDF is static, so animation is not captured —
only the snapshot.

## API

| Export | From | Purpose |
|---|---|---|
| `SlideDeck` | `remotion-deck` | React presentation surface (Player + keyboard nav) |
| `registerDeck`, `makeDeckRoot` | `remotion-deck` | Register slides as Remotion compositions |
| `renderDeckToPdf` | `remotion-deck/node` | Render the deck to a PDF (Node only) |
| `SlideDef`, `DeckConfig` | `remotion-deck` | Types |

## How it stays current with Remotion

- **peerDependencies** (`remotion`, `@remotion/*` pinned to `>=4 <5`) — the consumer's
  Remotion version is the one that runs; the wrapper never pins it.
- **[Renovate](https://docs.renovatebot.com/)** (`renovate.json`) groups all Remotion
  packages into a single auto-update PR (they must move together).
- **CI** (`.github/workflows/ci.yml`) builds and runs a PDF smoke render on every PR,
  in a matrix against both the pinned and the `latest` Remotion — so a bump that breaks
  the wrapper fails loudly before merge. Remotion **majors** are held for manual review
  (the peer range caps at `<5`).

## Develop

```bash
npm install
npm run example   # run the example deck in the browser
npm test          # build + smoke (render example → PDF, assert pages)
```

## Licensing

This wrapper's own source code is **MIT** (see [LICENSE](./LICENSE)). It does **not** bundle
or redistribute Remotion; it only references Remotion through `peerDependencies`.

> [!IMPORTANT]
> **Remotion itself is not MIT.** It ships under the source-available
> [Remotion License](https://www.remotion.dev/docs/license). It is **free** for individuals,
> for-profit companies with **up to 3 employees**, and non-profits; larger companies must buy
> a **Company License** from [remotion.pro](https://www.remotion.pro/). By using `remotion-deck`
> you are using Remotion and are bound by its license. This applies regardless of this wrapper's
> MIT license. See [NOTICE](./NOTICE).

The `SlideDeck` component passes `acknowledgeRemotionLicense` to the underlying `<Player>` to
suppress the runtime console notice; this is a convenience only and does **not** change your
obligations under the Remotion License.
