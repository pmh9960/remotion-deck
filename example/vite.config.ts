import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `root` is this example directory; run from repo root via `npm run example`.
export default defineConfig({
  root: __dirname,
  plugins: [react()],
});
