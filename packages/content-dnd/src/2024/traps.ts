/**
 * Traps, adapted from the System Reference Document 5.2.1.
 *
 * All eight example traps, condensed to one line each: name, severity band with
 * level range, trigger, and duration. The mechanics are summarised rather than
 * reproduced -- a GM who wants the exact saving throw reads the SRD, and a
 * smaller adaptation is both kinder to the table and less to get wrong.
 *
 * One entry per face of a d8, so the table is uniform.
 *
 * Overrides the generic `traps` table, which is original writing and
 * system-agnostic. The override is declared on the pack that carries this.
 */

import type { Table } from "@portents/core";
import { SRD_5_2_1 } from "../srd.ts";

export const traps: Table = {
	id: "traps",
	name: "Traps",
	description: "The SRD's example traps, with severity band and trigger.",
	dice: "1d8",
	provenance: {
		source: "adapted from the System Reference Document 5.2.1",
		license: "CC-BY-4.0",
		attribution: SRD_5_2_1,
	},
	entries: [
		{ range: [1, 1], text: "**Collapsing Roof** (deadly, levels 1–4). Triggered when a creature crosses a trip wire. Instantaneous." },
		{ range: [2, 2], text: "**Falling Net** (nuisance, levels 1–4). Triggered when a creature crosses a trip wire. Instantaneous." },
		{ range: [3, 3], text: "**Fire-Casting Statue** (deadly, levels 1–4). Triggered when a creature moves onto a pressure plate. Instantaneous, and the trap resets at the start of the next turn." },
		{ range: [4, 4], text: "**Hidden Pit** (nuisance, levels 1–4). Triggered when a creature moves onto the pit’s lid. Instantaneous." },
		{ range: [5, 5], text: "**Poisoned Darts** (deadly, levels 1–4). Triggered when a creature moves onto a pressure plate. Instantaneous, and the trap resets at the start of the next turn if it has activated fewer than three times." },
		{ range: [6, 6], text: "**Poisoned Needle** (nuisance, levels 1–4). Triggered when a creature opens the trap’s lock improperly or fails to disarm the trap. Instantaneous." },
		{ range: [7, 7], text: "**Rolling Stone** (deadly, levels 11–16; nuisance, levels 17–20). Triggered when a creature moves onto a pressure plate. Until the stone stops rolling." },
		{ range: [8, 8], text: "**Spiked Pit** (deadly, levels 1–4). Triggered when a creature moves onto the pit’s lid. Instantaneous." },
	],
};
