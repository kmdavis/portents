/**
 * The oracle: answering questions the GM has not already decided.
 *
 * This is what makes solo play work. At a table with a human GM, the GM is
 * surprised too — they did not decide in advance whether the gatehouse is still
 * manned. Alone, the temptation is to decide whatever suits the story, and then
 * nobody is playing. So the dice decide, and the GM finds out with the player.
 *
 * The fate chart here is original arithmetic, not a reproduction of any published
 * solo system:
 *
 *   Roll d100 under a threshold set by how likely a yes is. Land in the bottom
 *   fifth of the yes band for an emphatic yes; the top fifth of the no band for
 *   an emphatic no; the far edge of either band for a qualified one. Doubles
 *   (11, 22, 33...) mean something else is also happening, and pull a
 *   complication.
 *
 * The mechanism lives here; the words live in a content pack. Every function
 * that needs words takes a registry, and says exactly which table is missing if
 * the pack does not have it.
 */

import type { ContentRegistry } from "../packs/registry.ts";
import { roll } from "../dice/index.ts";
import { defaultRandomSource, type RandomSource } from "../ports/random.ts";
import { rollTable } from "../tables/table.ts";

export type Likelihood =
	| "certain"
	| "very likely"
	| "likely"
	| "even"
	| "unlikely"
	| "very unlikely"
	| "impossible";

export const LIKELIHOODS: readonly Likelihood[] = [
	"certain",
	"very likely",
	"likely",
	"even",
	"unlikely",
	"very unlikely",
	"impossible",
];

/** d100 thresholds. Ordered from most to least likely. */
const THRESHOLDS: Record<Likelihood, number> = {
	certain: 95,
	"very likely": 85,
	likely: 70,
	even: 50,
	unlikely: 30,
	"very unlikely": 15,
	impossible: 5,
};

export type YesNoAnswer = "yes, and" | "yes" | "yes, but" | "no, but" | "no" | "no, and";

export interface YesNoResult {
	readonly question: string;
	readonly likelihood: Likelihood;
	readonly d100: number;
	readonly threshold: number;
	readonly answer: YesNoAnswer;
	/** True when the d100 came up doubles: something unexpected also happens. */
	readonly twist: boolean;
	readonly complication?: string;
}

/** Table ids the oracle expects a pack to provide. */
export const ORACLE_TABLES = {
	complications: "oracle-complications",
	actions: "oracle-actions",
	subjects: "oracle-subjects",
	sceneSkew: "oracle-scene-skew",
	sceneInterrupt: "oracle-scene-interrupt",
	gmMoves: "gm-moves",
} as const;

export interface OracleOptions {
	readonly rng?: RandomSource;
	readonly registry?: ContentRegistry;
}

export function yesNo(
	question: string,
	likelihood: Likelihood = "even",
	options: OracleOptions = {},
): YesNoResult {
	const rng = options.rng ?? defaultRandomSource();
	const threshold = THRESHOLDS[likelihood];
	if (threshold === undefined) {
		throw new RangeError(`Unknown likelihood ${JSON.stringify(likelihood)}; expected one of ${LIKELIHOODS.join(", ")}`);
	}

	const d100 = rng.int(1, 100);
	const isYes = d100 <= threshold;

	const yesBand = threshold;
	const noBand = 100 - threshold;
	const emphaticYes = d100 <= Math.max(1, Math.floor(yesBand / 5));
	const emphaticNo = d100 > 100 - Math.max(1, Math.floor(noBand / 5));
	// The far edge of a band, short of emphatic, comes with a cost or consolation.
	const softYes = isYes && d100 > Math.floor(yesBand * 0.8);
	const softNo = !isYes && d100 <= threshold + Math.max(1, Math.floor(noBand * 0.2));

	const answer: YesNoAnswer = isYes
		? emphaticYes
			? "yes, and"
			: softYes
				? "yes, but"
				: "yes"
		: emphaticNo
			? "no, and"
			: softNo
				? "no, but"
				: "no";

	const twist = d100 % 11 === 0 && d100 !== 100;
	let complication: string | undefined;
	if (twist) {
		if (!options.registry) {
			complication = `(twist, but no content pack was supplied to draw a complication from)`;
		} else {
			try {
				complication = rollTable(options.registry.requireTable(ORACLE_TABLES.complications), {
					rng,
					registry: options.registry,
				}).text;
			} catch (error) {
				// Never drop a twist silently: a broken pack should be visible.
				complication = `(could not draw a complication: ${(error as Error).message})`;
			}
		}
	}

	return { question, likelihood, d100, threshold, answer, twist, complication };
}

export interface OracleDetail {
	readonly kind: string;
	readonly text: string;
	/**
	 * The dice behind the answer, never the answer itself. The caller prints both
	 * fields, and repeating the outcome here is how the output ended up doubled
	 * in an earlier version.
	 */
	readonly rolls: readonly string[];
}

function tableRoll(id: string, options: OracleOptions): { text: string; trace: string } {
	if (!options.registry) {
		throw new Error(
			`The oracle needs a content pack for the ${JSON.stringify(id)} table. ` +
				"Pass { registry } built from @portent/content or your own pack.",
		);
	}
	const table = options.registry.requireTable(id);
	const result = rollTable(table, { rng: options.rng, registry: options.registry });
	const trace = `${id} ${result.rolled ? `${result.rolled.expression} = ${result.rolled.total}` : "weighted"}`;
	return { text: result.text, trace };
}

/** An action and a subject, for when you need a nudge rather than an answer. */
export function meaning(options: OracleOptions = {}): OracleDetail {
	const action = tableRoll(ORACLE_TABLES.actions, options);
	const subject = tableRoll(ORACLE_TABLES.subjects, options);
	return {
		kind: "meaning",
		text: `${action.text} / ${subject.text}`,
		rolls: [action.trace, subject.trace],
	};
}

export function howMany(expression = "1d6", options: OracleOptions = {}): OracleDetail {
	const result = roll(expression, { rng: options.rng ?? defaultRandomSource() });
	return { kind: "how-many", text: String(result.total), rolls: [`${expression} = ${result.total}`] };
}

/** NPC attitude on a 2d6 ladder. */
export function reaction(modifier = 0, options: OracleOptions = {}): OracleDetail {
	const suffix = modifier === 0 ? "" : modifier > 0 ? `+${modifier}` : String(modifier);
	const expression = `2d6${suffix}`;
	const total = roll(expression, { rng: options.rng ?? defaultRandomSource() }).total;
	const text =
		total <= 3
			? "Hostile — acts against you now"
			: total <= 6
				? "Unfriendly — obstructs, demands, or withdraws"
				: total <= 8
					? "Neutral — wary, wants something first"
					: total <= 11
						? "Friendly — helps within reason"
						: "Enthusiastic — offers more than asked";
	return { kind: "reaction", text, rolls: [`${expression} = ${total}`] };
}

/**
 * Scene check: roll before framing a scene.
 *
 * Half the time the scene runs as intended. The rest of the time it is bent or
 * hijacked, which is where solo play stops being a story you are telling yourself.
 */
export function sceneCheck(options: OracleOptions = {}): OracleDetail {
	const rng = options.rng ?? defaultRandomSource();
	const d6 = rng.int(1, 6);
	if (d6 <= 3) {
		return { kind: "scene", text: "As expected — run the scene you had in mind.", rolls: [`1d6 = ${d6}`] };
	}
	const skewed = d6 <= 5;
	const detail = tableRoll(skewed ? ORACLE_TABLES.sceneSkew : ORACLE_TABLES.sceneInterrupt, {
		...options,
		rng,
	});
	return {
		kind: "scene",
		text: `${skewed ? "Skewed" : "Interrupted"} — ${detail.text}`,
		rolls: [`1d6 = ${d6}`, detail.trace],
	};
}

/** What the world does after a failed roll or a lull. */
export function gmMove(options: OracleOptions = {}): OracleDetail {
	const detail = tableRoll(ORACLE_TABLES.gmMoves, options);
	return { kind: "gm-move", text: detail.text, rolls: [detail.trace] };
}

export function formatYesNo(result: YesNoResult): string {
	const lines = [
		`**${result.answer.toUpperCase()}** — ${result.question}`,
		`_${result.likelihood}, d100 ${result.d100} vs ${result.threshold}_`,
	];
	if (result.complication) lines.push(`Twist: ${result.complication}`);
	return lines.join("\n");
}

/** Which oracle tables a pack is missing. Empty means the oracle will work. */
export function missingOracleTables(registry: ContentRegistry): string[] {
	return Object.values(ORACLE_TABLES).filter((id) => !registry.table(id));
}
