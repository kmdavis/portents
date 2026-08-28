/**
 * Content for the 2024 printing, drawn from SRD 5.2.1.
 *
 * SRD 5.2.1 is CC-BY-4.0 only -- no OGL involvement at all -- so everything here
 * carries one licence and one attribution statement.
 *
 * **No wild-magic table.** The Wild Magic sorcerous origin is not in any SRD:
 * 5.0, 5.1 and 5.2.1 all ship Draconic only, and the surge table is rulebook
 * content. Reproducing it here would be infringement, so the generic pack's
 * original wild-magic deck stands instead.
 */

import type { ContentPack } from "@portent/core";
import { sheet2024 } from "../sheets.ts";
import { SRD_5_2_1 } from "../srd.ts";
import { guidance } from "../guidance.generated.ts";
import { traps } from "./traps.ts";

export { traps } from "./traps.ts";
export { sheet2024 } from "../sheets.ts";

export const dnd2024Content: ContentPack = {
	id: "dnd-5e-2024",
	guidance: guidance.filter((entry) => entry.id === "dnd-5e-2024"),
	name: "Fifth edition, 2024 printing",
	tables: [traps],
	sheets: [sheet2024],
	// Declared, so replacing the generic table is a reviewable line rather than
	// last-writer-wins.
	overrides: [{ kind: "table", id: "traps", reason: "system-specific traps with level bands" }],
	provenance: {
		source: "adapted from the System Reference Document 5.2.1, plus original writing",
		license: "CC-BY-4.0",
		attribution: SRD_5_2_1,
	},
};
