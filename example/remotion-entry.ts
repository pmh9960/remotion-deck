// The Remotion entry used by renderDeckToPdf. It registers the deck's slides as
// compositions. In a real consumer this would be: import { registerDeck } from "remotion-deck";
import { registerDeck } from "../src";
import { DECK, SLIDES } from "./deck";

registerDeck(SLIDES, DECK);
