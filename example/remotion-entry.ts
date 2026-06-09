// The Remotion entry used by renderDeckToPdf. It registers the deck's slides as
// compositions. Imports from the package name (self-reference) so `npm test`
// exercises the BUILT dist exactly as a real consumer would.
import { registerDeck } from "remotion-deck";
import { DECK, SLIDES } from "./deck";

registerDeck(SLIDES, DECK);
