/**
 * Slash commands, and checking the ids the GM cites.
 *
 * Both exist because of the same session. The player typed `/roll 1d20`, which this
 * harness did not implement, so it went to the model as ordinary text -- and the model
 * then reported a result and cited `r-18`, a real ledger id belonging to a roll from an
 * earlier session. Nothing had been rolled.
 *
 * That is the exact failure the ledger exists to prevent, and it survived because
 * nothing checked. Prose telling a model not to invent ids is necessary and not
 * sufficient; the id it cites is a claim, and a claim about the ledger can be verified
 * against the ledger.
 */

/** What the player typed, once recognised. */
export type Command =
	| { readonly kind: "roll"; readonly expression: string }
	| { readonly kind: "ledger" }
	| { readonly kind: "status" }
	| { readonly kind: "help" }
	| { readonly kind: "unknown"; readonly name: string };

/**
 * Parse a slash command, or return undefined for ordinary speech.
 *
 * A bare `/` or anything with a space before the name is speech. Players write prose
 * containing slashes -- "Paladin 1 / Warlock 2" -- and that must never be a command.
 */
export function parseCommand(input: string): Command | undefined {
	const text = input.trim();
	if (!text.startsWith("/") || text.length === 1) return undefined;

	const match = text.match(/^\/([a-z-]+)\s*([\s\S]*)$/i);
	if (!match) return undefined;

	const name = match[1].toLowerCase();
	const rest = match[2].trim();

	switch (name) {
		case "roll":
		case "r":
			// A roll with no expression is a mistake worth reporting rather than a d20
			// nobody asked for.
			return rest ? { kind: "roll", expression: rest } : { kind: "unknown", name: "roll (no dice given)" };
		case "ledger":
			return { kind: "ledger" };
		case "status":
		case "brief":
			return { kind: "status" };
		case "help":
		case "?":
			return { kind: "help" };
		default:
			return { kind: "unknown", name };
	}
}

export const COMMAND_HELP: string = [
	"**Commands**",
	"",
	"- `/roll 2d20kh1+5` — roll dice yourself. The GM is told the result.",
	"- `/ledger` — open the audit trail.",
	"- `/status` — ask the GM to re-brief you on where things stand.",
	"- `/help` — this.",
	"",
	"Anything else is said to the GM.",
].join("\n");

/** A ledger id cited in prose, e.g. `r-18` or `h-42b`. */
const CITATION = /\b([a-z])-(\d+)([a-z])?\b/g;

export interface CitationProblem {
	readonly id: string;
	/** `unknown` is not in the ledger at all. `stale` is real but from an earlier turn. */
	readonly kind: "unknown" | "stale";
}

/**
 * Check the ids a reply cites against what actually happened.
 *
 * Two failures, and the second is the one that occurred:
 *
 * - **unknown**: the id is in no ledger entry. The number was invented outright.
 * - **stale**: the id is real but was not produced this turn. This is how `r-18` came to
 *   support a roll that never happened -- a genuine id from a previous session,
 *   reattached to a new claim. Legitimate references to old rolls exist, so this is
 *   reported as a caution rather than an error, but it is exactly the shape of a
 *   fabricated resolution and the player deserves to see it.
 */
export function checkCitations(
	prose: string,
	options: { readonly thisTurn: readonly string[]; readonly known: readonly string[] },
): CitationProblem[] {
	const thisTurn = new Set(options.thisTurn);
	const known = new Set(options.known);
	const problems: CitationProblem[] = [];
	const seen = new Set<string>();

	for (const match of prose.matchAll(CITATION)) {
		const id = match[0];
		if (seen.has(id) || thisTurn.has(id)) continue;
		seen.add(id);
		problems.push({ id, kind: known.has(id) ? "stale" : "unknown" });
	}

	return problems;
}

/** How to describe a citation problem to the player, in one line. */
export function describeCitations(problems: readonly CitationProblem[]): string {
	const unknown = problems.filter((problem) => problem.kind === "unknown").map((problem) => problem.id);
	const stale = problems.filter((problem) => problem.kind === "stale").map((problem) => problem.id);

	const lines: string[] = [];
	if (unknown.length > 0) {
		lines.push(
			`Cited ${unknown.join(", ")}, which is not in the ledger. That number was not rolled — ask the GM to roll it.`,
		);
	}
	if (stale.length > 0) {
		lines.push(
			`Cited ${stale.join(", ")}, which is real but was not rolled this turn. If the GM is reporting it as a new result, it is not one.`,
		);
	}
	return lines.join("\n");
}
