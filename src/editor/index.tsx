import { createRoot } from "react-dom/client";
import { DeckEditor } from "./DeckEditor.js";

/** Entry mounted by the CLI dev server (`remotion-deck dev`). */
export const mount = (el: HTMLElement) => {
  createRoot(el).render(<DeckEditor />);
};
