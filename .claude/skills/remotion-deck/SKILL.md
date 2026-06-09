---
name: remotion-deck
description: Author and edit presentation decks with remotion-deck — a JSON-driven slide deck with a visual editor, animations, and PDF export. Use when the user wants to make a slide deck or presentation, generate slides from notes/an outline, add or restyle slides, tidy a deck's layout, run the editor, or export to PDF. The deck is a single deck.json that both the user (visual editor) and you (this skill) edit.
---

# remotion-deck

A deck is one **`deck.json`** file. The `remotion-deck` CLI renders it, plays it, edits it
visually, and exports a PDF. You and the user edit the *same* file: you write/patch `deck.json`,
the user fine-tunes in the visual editor (`remotion-deck dev`). Slides are data, not code, so you
can generate a whole talk by writing JSON.

## CLI

| Command | What it does |
|---|---|
| `npx remotion-deck init` | Scaffold `deck.json` + `package.json` in an empty folder |
| `npx remotion-deck dev` | Open the visual editor (silent; `--open` to auto-open a tab) |
| `npx remotion-deck present` | Play the deck full-screen |
| `npx remotion-deck pdf` | Render `deck.json` → `presentation.pdf` (one page per slide) |
| `npx remotion-deck doctor` | Tidy layout: align edges, snap to grid, trim whitespace (`--dry` to preview) |

After writing or editing `deck.json`, run `npx remotion-deck doctor` to auto-align, then
`npx remotion-deck pdf` if the user wants a PDF.

## deck.json schema

```jsonc
{
  "config": { "fps": 30, "width": 1920, "height": 1080,
    "theme": { "accent1": "#6366f1", "accent2": "#ec4899", "text": "#f5f6fa", "bg": "#0b0d12", "font": "Segoe UI, system-ui, sans-serif" } },
  "slides": [
    {
      "id": "title",                  // unique, stable
      "durationInFrames": 90,         // intro animation length (30fps → 90 = 3s)
      "background": { "type": "radial", "from": "#11141d", "to": "#0b0d12", "at": "18% 0%" },
      "elements": [ /* see below */ ]
    }
  ]
}
```

**Element** (positions are composition pixels in the 1920×1080 space):
```jsonc
{ "id": "title", "type": "text", "x": 140, "y": 520, "w": 1620, "h": 200,
  "text": "Line one\nLine two",
  "style": { "fontSize": 88, "fontWeight": 800, "color": "#f5f6fa", "align": "left",
             "lineHeight": 1.1, "letterSpacing": "0.02em", "italic": false,
             "uppercase": false, "gradientText": false },
  "animation": { "preset": "rise", "start": 0 } }
```
- `type: "text"` → `text`. `type: "image"` → `src`. `type: "shape"` → `shape: "rect" | "pill" | "line"`
  (shapes fill with the accent gradient unless `style.background` is set).
- `style.gradientText: true` fills text with the accent gradient (great for closing lines).
- `background`: a color string, or `{ "type": "radial" | "linear", "from", "to", "at" }`.

**Animation presets** (`animation.preset`, with `start` frame and optional `duration`):
`none`, `fade`, `rise`, `slide-left`, `slide-up`, `pop`, `typewriter`.

## Authoring conventions (match the built-in look)

- Left margin `x: 140`. Title slide: eyebrow (fontSize 26, `uppercase`, color `#6366f1`) → title
  (fontSize 88–96, fontWeight 800) → a `shape` `pill` rule (h 6) → subtitle (fontSize 34, dim).
- Content slide: eyebrow/section label → heading (fontSize 60, weight 800) → sub (28, dim) →
  bullets as text elements prefixed `"•   "` (fontSize 32–38).
- Stagger reveals: give each element an increasing `animation.start` (~6–16 frames apart) so
  content builds in. Use `rise`/`slide-up` for body, `fade` for labels, `pop`/`gradientText` for
  closings.
- Dim text color: `"rgba(245,246,250,0.6)"`. Accents: `#6366f1` (indigo), `#ec4899` (pink).
- Array order == presentation order == PDF page order.

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
