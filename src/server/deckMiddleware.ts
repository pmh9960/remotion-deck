import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/**
 * Serves the deck JSON.
 *  - GET  /__deck          → the newest of deck.json / deck.autosave.json (so you
 *                            resume your latest work, and Claude's edits are picked up).
 *  - POST /__deck          → silent autosave to deck.autosave.json (the sidecar).
 *  - POST /__deck?mode=commit → write deck.json (explicit save, Ctrl+S) and drop the sidecar.
 * This keeps deck.json from churning on every keystroke — it only changes on an explicit save.
 */
export const deckMiddleware = (opts: { deckFile: string }): Plugin => {
  const dir = path.dirname(opts.deckFile);
  const base = path.basename(opts.deckFile).replace(/\.json$/i, "");
  const autosaveFile = path.join(dir, `${base}.autosave.json`);

  const readNewest = (): string => {
    const hasMain = fs.existsSync(opts.deckFile);
    const hasAuto = fs.existsSync(autosaveFile);
    if (hasAuto && hasMain) {
      const newer =
        fs.statSync(autosaveFile).mtimeMs >= fs.statSync(opts.deckFile).mtimeMs
          ? autosaveFile
          : opts.deckFile;
      return fs.readFileSync(newer, "utf8");
    }
    if (hasAuto) return fs.readFileSync(autosaveFile, "utf8");
    if (hasMain) return fs.readFileSync(opts.deckFile, "utf8");
    return '{"slides":[]}';
  };

  return {
    name: "remotion-deck:deck-api",
    configureServer(server) {
      server.middlewares.use("/__deck", (req, res) => {
        if (req.method === "GET") {
          res.setHeader("content-type", "application/json");
          res.end(readNewest());
          return;
        }
        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            try {
              const parsed = JSON.parse(body);
              const pretty = JSON.stringify(parsed, null, 2) + "\n";
              const commit = (req.url ?? "").includes("mode=commit");
              if (commit) {
                fs.writeFileSync(opts.deckFile, pretty);
                if (fs.existsSync(autosaveFile)) fs.rmSync(autosaveFile);
              } else {
                fs.writeFileSync(autosaveFile, pretty);
              }
              res.statusCode = 200;
              res.end(commit ? "committed" : "autosaved");
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
  };
};
