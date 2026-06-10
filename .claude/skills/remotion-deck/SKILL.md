---
name: remotion-deck
description: Author and edit presentation decks with remotion-deck — a JSON-driven slide deck with a visual editor, animations, and PDF export. Use when the user wants to make a slide deck or presentation, generate slides from notes/an outline, add or restyle slides, tidy a deck's layout, run the editor, or export to PDF. The deck is a single deck.json that both the user (visual editor) and you (this skill) edit.
---

# remotion-deck

A deck is one **`deck.json`** file. The `remotion-deck` CLI renders it, plays it, edits it
visually, and exports a PDF. You and the user edit the *same* file: you write/patch `deck.json`,
the user fine-tunes in the visual editor (`remotion-deck dev`). Slides are data, not code, so you
can generate a whole talk by writing JSON.

**Setup (if not installed yet):** the package is on GitHub — `npm install pmh9960/remotion-deck`
(its `prepare` script builds on install; no npm publish needed). To (re)install this skill into a
project, run `npx remotion-deck skill` (or `--global` for `~/.claude`). A deck project also needs
the Remotion peers; `remotion-deck init` scaffolds them.

**The editor is collaborative.** In `remotion-deck dev` the user can: multi-select + drag (Shift =
axis lock), resize single or group (Shift = aspect lock), align/distribute, nudge with arrows,
inline-edit text with Bold/Italic/Underline/bullets, insert text/shapes/images (paste or drop),
reorder z-index, and undo/redo per action. They also have a chat box that edits the deck. So a
common flow is: the user roughs out boxes, then asks you (or the chat) to "make it look good" —
you restyle by patching `deck.json`. Keep element `id`s stable so their selections/edits line up.

## CLI

| Command | What it does |
|---|---|
| `npx remotion-deck init` | Scaffold `deck.json` + `package.json` in an empty folder |
| `npx remotion-deck dev` | Open the visual editor (silent; `--open` to auto-open a tab, `--host` for remote/headless) |
| `npx remotion-deck present` | Play the deck full-screen |
| `npx remotion-deck pdf` | Render `deck.json` → `presentation.pdf` (one page per slide) |
| `npx remotion-deck html` | Bundle a self-contained `presentation.html` (no server; share/open anywhere) |
| `npx remotion-deck doctor` | Tidy layout: align edges, snap to grid, trim whitespace (`--dry` to preview) |
| `npx remotion-deck skill` | Install this skill into a project (`--global` for `~/.claude`) |

After writing or editing `deck.json`, run `npx remotion-deck doctor` to auto-align, then
`npx remotion-deck pdf` (or `html`) if the user wants an exportable artifact.

**Headless / Linux servers:** `dev`, `present`, and `html` need no browser on the host — run
`remotion-deck dev --host` and open the printed Network URL from any machine. Only `pdf` renders
through a headless Chromium (Remotion auto-downloads it; on minimal Linux you may need system libs
like `libnss3`/`libatk`). `html` is the dependency-free way to produce a shareable artifact headless.

## deck.json schema

```jsonc
{
  "config": { "fps": 30, "width": 1920, "height": 1080,
    "theme": { "accent1": "#005abe", "accent2": "#3d86d6", "text": "#1f2937", "bg": "#ffffff", "font": "Segoe UI, system-ui, sans-serif" } },
  "slides": [
    {
      "id": "title",                  // unique, stable
      "durationInFrames": 90,         // intro animation length (30fps → 90 = 3s)
      "background": { "type": "radial", "from": "#ffffff", "to": "#eef3fb", "at": "18% 0%" },
      "elements": [ /* see below */ ]
    }
  ]
}
```

**Element** (positions are composition pixels in the 1920×1080 space):
```jsonc
{ "id": "title", "type": "text", "x": 140, "y": 520, "w": 1620, "h": 200,
  "text": "Line one\nLine two",
  "style": { "fontSize": 88, "fontWeight": 800, "color": "#1f2937", "align": "left",
             "lineHeight": 1.1, "letterSpacing": "0.02em", "italic": false,
             "underline": false, "uppercase": false, "gradientText": false },
  "animation": { "preset": "rise", "start": 0 } }
```
- `type: "text"` → `text`. `type: "image"` → `src`. `type: "shape"` → `shape: "rect" | "pill" | "line"`
  (shapes fill with the accent gradient unless `style.background` is set).
- Image `src` may be a data-URL, an `http(s)` URL, or a project-relative `assets/<file>` path. The
  editor stores pasted/dropped images under `assets/` and references them by path (keeps deck.json
  small); `pdf`/`html` exports re-inline them so the artifact stays self-contained. When you author
  images by hand, prefer a URL or an existing `assets/...` file.
- Images fit their `w`×`h` box via `style.objectFit` (CSS object-fit), default **`"contain"`**
  (whole image fits, never cropped; letterboxes if the box aspect ratio differs from the image).
  So size the box to the image's native aspect ratio for a tight, bar-free fit. Set
  `style.objectFit: "cover"` to fill+crop instead.
- `style.gradientText: true` fills text with the accent gradient (great for closing lines).
- `background`: a color string, or `{ "type": "radial" | "linear", "from", "to", "at" }`.

**Animation presets** (`animation.preset`, with `start` frame and optional `duration`):
`none`, `fade`, `rise`, `slide-left`, `slide-up`, `pop`, `typewriter`.

## Authoring conventions (match the built-in look)

- Left margin `x: 140`. Title slide: eyebrow (fontSize 26, `uppercase`, color `#005abe`) → title
  (fontSize 88–96, fontWeight 800) → a `shape` `pill` rule (h 6) → subtitle (fontSize 34, dim).
- Content slide: eyebrow/section label → heading (fontSize 60, weight 800) → sub (28, dim) →
  bullets as text elements prefixed `"•   "` (fontSize 32–38).
- Stagger reveals: give each element an increasing `animation.start` (~6–16 frames apart) so
  content builds in. Use `rise`/`slide-up` for body, `fade` for labels, `pop`/`gradientText` for
  closings.
- Array order == presentation order == PDF page order.

### Palette & color (light theme — keep it simple)

The default theme is **light** (bg `#ffffff`, text `#1f2937`, dim `rgba(31,41,55,0.55)`). One project
palette, used sparingly. **Default everything to blue**; reach for the others only when the meaning
calls for it.

| role | vivid (text / emphasis) | soft tint (block / shape fill) |
|---|---|---|
| blue — primary / positive (use almost always) | `#005abe` | `#d9e6f5` |
| red — negative (rare: warnings / "bad") | `#e6222e` | `#fbdee0` |
| yellow — baseline / incidental highlight | `#ffc000` | `#fff6d9` |
| green — special case (the special one) | `#00b464` | `#d9f4e8` |

- **Vivid colors are for TEXT / thin accents** (eyebrows, key numbers, the pill rule, gradientText).
  They're punchy — don't fill big blocks with them.
- **For a colored BLOCK / shape behind dark text, use the soft tint** (the `…Soft` column) with text
  in `#1f2937`. Keeps it readable and calm.
- **Personalization (this user):** simple. Blue for essentially everything; **red only** when you
  genuinely need a negative signal; **green** for the rare special/highlighted case; **yellow** for a
  baseline that must stand out. A normal baseline / neutral element stays **gray** (`#6b7280`), not a
  color. Avoid more than ~2 accent colors on one slide.
- These tokens also live in code as `PALETTE` in `schema.ts` (vivid + `…Soft` tints).

## Typical flows

- **Generate a deck from an outline**: write a `deck.json` with a title slide, one slide per
  section (heading + bullets), and a closing — following the conventions above. Then run
  `npx remotion-deck doctor` and tell the user to run `npx remotion-deck dev` to refine.
- **Edit existing**: read `deck.json`, patch the targeted slide/element, keep ids stable.
- **Restyle**: adjust `style` / `config.theme`; positions stay in composition px.

## Verification

After authoring, run `npx remotion-deck pdf` (or `doctor --dry`) to confirm the deck parses and
renders. If the user has the editor open, your `deck.json` edits appear on their next load.

## Advanced: code slides

For a slide that needs arbitrary React/Remotion logic, a project can also use the library API
(`import { SlideDeck, deckFromJson } from "remotion-deck"`) and mix in a custom component slide.
This bypasses the zero-config CLI and needs a project build — prefer JSON slides unless a slide
truly needs custom code.

## Licensing

Remotion (a peer dependency) is NOT MIT — free for individuals, companies ≤3 people, and
non-profits; larger companies need a paid Company License (remotion.pro). Mention this when the
user distributes a deck. See the repo's NOTICE.

## Local-dev gotcha

When testing an unpublished build of remotion-deck in a separate project, install it via a packed
tarball (`npm pack` then `npm i ../remotion-deck/remotion-deck-x.y.z.tgz`), NOT `file:`/`npm link`
— a symlink yields two Remotion copies and the deck throws "useCurrentFrame can only be called
inside a component that was passed to <Player>".
