/**
 * Content for the 2014 printing.
 *
 * SRD 5.1 covers this printing and is offered under OGL 1.0a *and* CC-BY-4.0; we
 * take CC-BY-4.0, because the OGL's chain-of-notices obligation is perpetual
 * bookkeeping and it has no SPDX identifier.
 *
 * Currently only a sheet scaffold. SRD 5.1 has no traps section of the kind
 * 5.2.1 added, and inventing one while attributing it to the SRD would be worse
 * than shipping nothing.
 */

import type { ContentPack } from "@portents/core";
import { guidance } from "../guidance.generated.ts";
import { sheet2014 } from "../sheets.ts";

export { sheet2014 } from "../sheets.ts";

export const dnd2014Content: ContentPack = {
	id: "dnd-5e-2014",
	guidance: guidance.filter((entry) => entry.id === "dnd-5e-2014"),
	name: "Fifth edition, 2014 printing",
	sheets: [sheet2014],
	provenance: { source: "original writing for Portents", license: "CC0-1.0" },
};
