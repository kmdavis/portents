/**
 * Reading a party out of sheets, for display.
 *
 * Pure, so the one piece of arithmetic here is testable. The rest of the party card is
 * DOM assembly and lives with the other DOM code.
 */

/**
 * The status keys worth showing on a small card, in display order.
 *
 * A deliberately short list. The sheet holds everything; this is what a player glances
 * at mid-fight. Keys absent from a given system's sheet are simply skipped, which is
 * why one list serves fifth edition and Pathfinder both.
 */
export const PARTY_STAT_KEYS: readonly string[] = [
	"HP",
	"AC",
	"Hit Dice",
	"Death Saves",
	"Conditions",
	"Hero Points",
	"Dying",
	"Wounded",
];

/**
 * Is a `"17/26"` style value at or below half?
 *
 * Used only to colour a number, but it earns a test: the sheet stores hit points as
 * free text that the player may edit, so this has to cope with whatever is actually in
 * there -- negatives, spaces, a bare number with no maximum, or prose.
 */
export function isHurt(value: string): boolean {
	const match = value.match(/^\s*(-?\d+)\s*\/\s*(\d+)/);
	if (!match) return false;
	const current = Number(match[1]);
	const max = Number(match[2]);
	return max > 0 && current <= max / 2;
}
