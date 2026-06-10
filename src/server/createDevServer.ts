import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { createServer, type ViteDevServer } from "vite";
import { chatMiddleware } from "./chatMiddleware.js";
import { deckMiddleware } from "./deckMiddleware.js";
import { exportMiddleware } from "./exportMiddleware.js";

const htmlTemplate = (entry: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>remotion-deck</title>
    <style>html,body,#root{height:100%;margin:0;background:#0b0d12;overflow:hidden}</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">
      import { mount } from "${entry}";
      mount(document.getElementById("root"));
    </script>
  </body>
</html>
`;

/** Start a Vite dev server that serves the bundled editor (or present) app from the
 *  installed remotion-deck package, with the cwd's deck.json mounted at /__deck. */
export const createDevServer = async (opts: {
  cwd: string;
  deckFile: string;
  mode: "editor" | "present";
  port?: number;
  /** Auto-open a browser tab. Default false (silent) — opt in with `--open`. */
  open?: boolean;
}): Promise<ViteDevServer> => {
  const appDir = path.join(opts.cwd, ".remotion-deck");
  fs.mkdirSync(appDir, { recursive: true });
  const entry = opts.mode === "present" ? "remotion-deck/present" : "remotion-deck/editor";
  fs.writeFileSync(path.join(appDir, "index.html"), htmlTemplate(entry));

  const server = await createServer({
    configFile: false,
    root: appDir,
    plugins: [react(), deckMiddleware({ deckFile: opts.deckFile }), chatMiddleware({ cwd: opts.cwd }), exportMiddleware({ cwd: opts.cwd })],
    optimizeDeps: { include: ["react", "react-dom", "react-dom/client"] },
    server: { port: opts.port ?? 5173, open: opts.open ?? false },
  });
  await server.listen();
  server.printUrls();
  return server;
};
