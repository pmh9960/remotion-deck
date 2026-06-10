import { build } from "esbuild";

/**
 * Bundle a deck into ONE self-contained .html file (React + Remotion player + the deck data
 * inlined), so it can be shared/opened anywhere with no server. resolveDir must be the deck
 * project (so "remotion-deck" and its peers resolve from its node_modules).
 */
export const buildHtml = async (deck: unknown, resolveDir: string): Promise<string> => {
  const entry = `import { createRoot } from "react-dom/client";
import { SlideDeck, deckFromJson } from "remotion-deck";
const deck = ${JSON.stringify(deck)};
const { slides, config } = deckFromJson(deck);
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
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Presentation</title>
    <style>html,body,#root{height:100%;margin:0;background:#0b0d12;overflow:hidden}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>${js}</script>
  </body>
</html>
`;
};
