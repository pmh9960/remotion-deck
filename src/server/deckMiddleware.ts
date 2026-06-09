import fs from "node:fs";
import type { Plugin } from "vite";

/** A Vite plugin that serves the deck JSON: GET /__deck reads the file, POST /__deck
 *  writes it back (pretty-printed, so hand edits and Claude edits stay git-friendly). */
export const deckMiddleware = (opts: { deckFile: string }): Plugin => ({
  name: "remotion-deck:deck-api",
  configureServer(server) {
    server.middlewares.use("/__deck", (req, res) => {
      if (req.method === "GET") {
        try {
          res.setHeader("content-type", "application/json");
          res.end(fs.readFileSync(opts.deckFile, "utf8"));
        } catch {
          res.statusCode = 404;
          res.end('{"slides":[]}');
        }
        return;
      }
      if (req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            fs.writeFileSync(opts.deckFile, JSON.stringify(parsed, null, 2) + "\n");
            res.statusCode = 200;
            res.end("ok");
          } catch (err) {
            res.statusCode = 400;
            res.end(String(err));
          }
        });
        return;
      }
      res.statusCode = 405;
      res.end();
    });
  },
});
