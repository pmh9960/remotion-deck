import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import type { DeckJson } from "../schema.js";

/** POST /__export { format:"pdf"|"html", deck } → renders the deck to presentation.pdf /
 *  presentation.html in the project dir, then streams the rendered file back as an attachment so
 *  the browser downloads it to the user's local machine (the host may be a remote dev server). The
 *  rendered filename is also echoed in the `x-remotion-deck-output` header. Errors return JSON 500. */
export const exportMiddleware = (opts: { cwd: string }): Plugin => ({
  name: "remotion-deck:export-api",
  configureServer(server) {
    server.middlewares.use("/__export", (req, res) => {
      if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        const fail = (msg: string) => {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: msg }));
        };
        try {
          const { format, deck } = JSON.parse(body) as { format: "pdf" | "html"; deck: DeckJson };
          let filePath: string;
          let contentType: string;
          if (format === "html") {
            const { buildHtml } = await import("../html.js");
            filePath = path.join(opts.cwd, "presentation.html");
            fs.writeFileSync(filePath, await buildHtml(deck, opts.cwd));
            contentType = "text/html; charset=utf-8";
          } else {
            // images inlined as data-URLs, videos copied into publicDir + staticFile'd (avoids the
            // OffthreadVideo proxy 431 on giant base64 data-URLs) — see writePdfEntry.
            const { writePdfEntry } = await import("../pdfEntry.js");
            const { entryPoint, publicDir, tmpDir } = writePdfEntry(deck, opts.cwd);
            const { renderDeckToPdf } = await import("../node.js");
            filePath = path.join(opts.cwd, "presentation.pdf");
            try {
              await renderDeckToPdf({ entryPoint, output: filePath, publicDir });
            } finally {
              fs.rmSync(tmpDir, { recursive: true, force: true });
            }
            contentType = "application/pdf";
          }
          // Stream the file back as a download; it also stays on disk in the project dir.
          const fileName = path.basename(filePath);
          const buf = fs.readFileSync(filePath);
          res.statusCode = 200;
          res.setHeader("content-type", contentType);
          res.setHeader("content-disposition", `attachment; filename="${fileName}"`);
          res.setHeader("x-remotion-deck-output", fileName);
          res.end(buf);
        } catch (err) {
          fail(String((err as Error)?.message ?? err));
        }
      });
    });
  },
});
