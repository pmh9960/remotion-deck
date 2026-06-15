import { build } from "esbuild";
import { inlineAssets } from "./assets.js";
import type { DeckJson } from "./schema.js";

/**
 * Bundle a deck into ONE self-contained .html file (React + Remotion player + the deck data
 * inlined), so it can be shared/opened anywhere with no server. resolveDir must be the deck
 * project (so "remotion-deck" and its peers resolve from its node_modules, and assets/ files
 * referenced by the deck can be inlined as data-URLs).
 */
export const buildHtml = async (deck: DeckJson, resolveDir: string): Promise<string> => {
  const embedded = inlineAssets(deck, resolveDir);
  const entry = `import { createRoot } from "react-dom/client";
import { SlideDeck, deckFromJson } from "remotion-deck";
const deck = ${JSON.stringify(embedded)};
const { slides, config } = deckFromJson(deck, "present");
createRoot(document.getElementById("root")).render(<SlideDeck slides={slides} config={config} />);
`;
  const result = await build({
    stdin: { contents: entry, loader: "tsx", resolveDir },
    bundle: true,
    format: "iife",
    jsx: "automatic",
    minify: true,
    write: false,
    logLevel: "silent",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const js = result.outputFiles[0].text;
  const fontUrl = deck.config?.theme?.fontUrl;
  const fontLink = fontUrl ? `\n    <link rel="stylesheet" href="${fontUrl}" />` : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Presentation</title>${fontLink}
    <style>html,body,#root{height:100%;margin:0;background:#0b0d12;overflow:hidden}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>${js}</script>
  </body>
</html>
`;
};
