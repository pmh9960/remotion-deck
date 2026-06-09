#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();

const usage = () => {
  console.log(`remotion-deck <command>

  pdf       Render deck.json to presentation.pdf
  present   (coming next) Play the deck full-screen
  dev       (coming next) Open the visual editor
  init      (coming next) Scaffold a new deck

Options:
  --deck <path>     deck JSON file (default: deck.json)
  --out <path>      output PDF path (default: presentation.pdf)
`);
};

const getFlag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};

const loadDeck = (deckPath: string) => {
  if (!fs.existsSync(deckPath)) {
    console.error(`remotion-deck: ${path.relative(cwd, deckPath)} not found`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(deckPath, "utf8"));
};

const cmdPdf = async () => {
  const deckPath = path.resolve(cwd, getFlag("deck") ?? "deck.json");
  const out = path.resolve(cwd, getFlag("out") ?? "presentation.pdf");
  const deck = loadDeck(deckPath);

  // Write a temporary Remotion entry INSIDE the project so that "remotion-deck"
  // resolves from the project's node_modules. The deck JSON is embedded as a
  // literal to avoid any import-path resolution for the data file.
  const tmpDir = path.join(cwd, ".remotion-deck");
  fs.mkdirSync(tmpDir, { recursive: true });
  const entry = path.join(tmpDir, "entry.tsx");
  fs.writeFileSync(
    entry,
    `import { registerDeck, deckFromJson } from "remotion-deck";\n` +
      `const deck = ${JSON.stringify(deck)};\n` +
      `const { slides, config } = deckFromJson(deck);\n` +
      `registerDeck(slides, config);\n`,
  );

  try {
    const { renderDeckToPdf } = await import("./node.js");
    const result = await renderDeckToPdf({
      entryPoint: entry,
      output: out,
      onProgress: ({ id, index, total }: { id: string; index: number; total: number }) =>
        console.log(`  ${index + 1}/${total} ${id}`),
    });
    console.log(`✓ wrote ${path.relative(cwd, result.output)} (${result.pages} pages)`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
};

const cmdServe = async (mode: "editor" | "present") => {
  const deckFile = path.resolve(cwd, getFlag("deck") ?? "deck.json");
  if (!fs.existsSync(deckFile)) {
    console.error(`remotion-deck: ${path.relative(cwd, deckFile)} not found`);
    process.exit(1);
  }
  const port = Number(getFlag("port")) || 5173;
  const { createDevServer } = await import("./server/createDevServer.js");
  await createDevServer({ cwd, deckFile, mode, port });
  // Keep the process alive; the Vite server runs until Ctrl+C.
};

const main = async () => {
  const command = process.argv[2];
  switch (command) {
    case "pdf":
      await cmdPdf();
      break;
    case "dev":
      await cmdServe("editor");
      break;
    case "present":
      await cmdServe("present");
      break;
    case "init":
      console.error(`remotion-deck: "${command}" is not implemented yet.`);
      process.exit(1);
      break;
    case undefined:
    case "-h":
    case "--help":
      usage();
      break;
    default:
      console.error(`remotion-deck: unknown command "${command}"`);
      usage();
      process.exit(1);
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
