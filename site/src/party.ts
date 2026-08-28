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
 * Shown even when the sheet has no value for them.
 *
 * A blank row reading "not recorded" is a visible prompt that the GM never wrote them
 * down. Skipping the row hides it, which is how a character ends up described as
 * "lightly wounded" with no hit points recorded anywhere.
 */
export const ALWAYS_SHOWN: readonly string[] = ["HP", "AC"];

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

/**
 * The status values from a sheet, whatever nesting they arrived in.
 *
 * Status keys live in a `status` map inside the frontmatter, not at the top level.
 * The party card read `data[key]` and therefore found nothing, ever -- so a character
 * described in the fiction as wounded showed no hit points at all, and the bug looked
 * like the GM failing to record them rather than the card failing to read them.
 *
 * Top-level keys are still accepted, because a player hand-editing their own sheet may
 * reasonably put `HP: 17/26` at the root and should not be silently ignored.
 */
export function statusOf(data: Readonly<Record<string, unknown>> | undefined): Record<string, string> {
	if (!data) return {};
	const nested = data["status"];
	const values: Record<string, string> = {};

	if (nested && typeof nested === "object" && !Array.isArray(nested)) {
		for (const [key, value] of Object.entries(nested as Record<string, unknown>)) {
			if (value !== undefined && value !== null) values[key] = String(value);
		}
	}
	for (const key of PARTY_STAT_KEYS) {
		const top = data[key];
		if (values[key] === undefined && top !== undefined && top !== null) values[key] = String(top);
	}
	return values;
}
