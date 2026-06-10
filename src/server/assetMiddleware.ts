import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
};
const EXT_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_EXT).map(([m, e]) => [e, m]),
);

const parseDataUrl = (dataUrl: string): { bytes: Buffer; ext: string } | null => {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  const mime = m[1];
  const ext = MIME_EXT[mime] ?? "bin";
  const bytes = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]), "utf8");
  return { bytes, ext };
};

/**
 * Stores image assets as files instead of inlining data-URLs into deck.json.
 *  - POST /__asset { dataUrl }      → writes assets/<contentHash>.<ext>, returns { path }.
 *  - GET  /assets/<file>            → serves the stored asset.
 *  - POST /__assets/gc { keep: [] } → deletes assets/* whose "assets/<file>" ref is not in
 *                                     `keep` (the set still reachable via the deck + undo/redo
 *                                     history). Lets orphaned images be reclaimed once they
 *                                     fall out of the undo range.
 */
export const assetMiddleware = (opts: { cwd: string }): Plugin => {
  const assetsDir = path.join(opts.cwd, "assets");

  return {
    name: "remotion-deck:asset-api",
    configureServer(server) {
      server.middlewares.use("/__asset", (req, res) => {
        if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          try {
            const { dataUrl } = JSON.parse(body) as { dataUrl: string };
            const parsed = parseDataUrl(dataUrl);
            if (!parsed) { res.statusCode = 400; res.end("invalid data URL"); return; }
            const hash = crypto.createHash("sha1").update(parsed.bytes).digest("hex").slice(0, 16);
            const file = `${hash}.${parsed.ext}`;
            fs.mkdirSync(assetsDir, { recursive: true });
            const dest = path.join(assetsDir, file);
            if (!fs.existsSync(dest)) fs.writeFileSync(dest, parsed.bytes);
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ path: `assets/${file}` }));
          } catch (err) {
            res.statusCode = 400;
            res.end(String(err));
          }
        });
      });

      server.middlewares.use("/__assets/gc", (req, res) => {
        if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          try {
            const { keep } = JSON.parse(body) as { keep: string[] };
            const keepSet = new Set(keep);
            let removed = 0;
            if (fs.existsSync(assetsDir)) {
              for (const file of fs.readdirSync(assetsDir)) {
                if (!keepSet.has(`assets/${file}`)) {
                  fs.rmSync(path.join(assetsDir, file), { force: true });
                  removed += 1;
                }
              }
            }
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ removed }));
          } catch (err) {
            res.statusCode = 400;
            res.end(String(err));
          }
        });
      });

      server.middlewares.use("/assets/", (req, res, next) => {
        const file = path.basename((req.url ?? "").split("?")[0]);
        const full = path.join(assetsDir, file);
        if (!fs.existsSync(full)) { next(); return; }
        const ext = path.extname(full).slice(1).toLowerCase();
        res.setHeader("content-type", EXT_MIME[ext] ?? "application/octet-stream");
        res.setHeader("cache-control", "no-cache");
        fs.createReadStream(full).pipe(res);
      });
    },
  };
};
