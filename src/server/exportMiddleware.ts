import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import type { DeckJson } from "../schema.js";

/** POST /__export { format:"pdf"|"html", deck } → renders the deck to presentation.pdf /
 *  presentation.html in the project dir and returns the filename. */
export const exportMiddleware = (opts: { cwd: string }): Plugin => ({
  name: "remotion-deck:export-api",
  configureServer(server) {
    server.middlewares.use("/__export", (req, res) => {
      if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        const send = (obj: unknown) => {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(obj));
        };
        try {
          const { format, deck } = JSON.parse(body) as { format: "pdf" | "html"; deck: DeckJson };
          if (format === "html") {
            const { buildHtml } = await import("../html.js");
            fs.writeFileSync(path.join(opts.cwd, "presentation.html"), await buildHtml(deck, opts.cwd));
            send({ output: "presentation.html" });
            return;
          }
          const { inlineAssets } = await import("../assets.js");
          const embedded = inlineAssets(deck, opts.cwd);
          const tmp = path.join(opts.cwd, ".remotion-deck");
          fs.mkdirSync(tmp, { recursive: true });
          const entry = path.join(tmp, "export-entry.tsx");
          fs.writeFileSync(
            entry,
            `import { registerDeck, deckFromJson } from "remotion-deck";\nconst deck = ${JSON.stringify(embedded)};\nconst { slides, config } = deckFromJson(deck);\nregisterDeck(slides, config);\n`,
          );
          const { renderDeckToPdf } = await import("../node.js");
          await renderDeckToPdf({ entryPoint: entry, output: path.join(opts.cwd, "presentation.pdf") });
          send({ output: "presentation.pdf" });
        } catch (err) {
          send({ error: String((err as Error)?.message ?? err) });
        }
      });
    });
  },
});
