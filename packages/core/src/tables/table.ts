/**
 * Random tables, with recursive composition.
 *
 * Two flavours: **dice-keyed** (`dice: "1d20"` plus a `range` on each entry — the
 * classic printed table) and **weighted** (no dice, optional `weight`). Dice-keyed
 * tables are checked for gaps and overlaps, because a table that silently cannot
 * roll entry 13 is worse than one that fails loudly.
 *
 * Entry text can pull in other content, resolved recursively:
 *
 * ```
 * {{table:names-dwarf}}      roll another table
 * {{roll:2d6}}               inline dice
 * {{pick:north|south|east}}  inline choice
 * {{deck:npc-sparks}}        draw a card's name
 * ```
 *
 * So one roll on an encounter table can name the NPC, roll their numbers and pick
 * their attitude. Lookups go through an injected registry, so this module never
 * reads a global and a test can supply two tables instead of the whole corpus.
 */

import type { ContentRegistry } from "../packs/registry.ts";
import { emptyRegistry, type Provenance } from "../packs/registry.ts";
import { drawEphemeral } from "../decks/deck.ts";
import { parse, roll } from "../dice/index.ts";
import { defaultRandomSource, type RandomSource } from "../ports/random.ts";

export interface TableEntry {
	/** Inclusive range on the table's dice. Required when the table is dice-keyed. */
	readonly range?: readonly [number, number];
	/** Relative likelihood for a weighted table. Defaults to 1. */
	readonly weight?: number;
	readonly text: string;
	readonly tags?: readonly string[];
}

export interface Table {
	readonly id: string;
	readonly name: string;
	readonly description?: string;
	/** Dice expression keyed to `range`. Omit for a weighted table. */
	readonly dice?: string;
	readonly system?: string;
	readonly provenance?: Provenance;
	readonly entries: readonly TableEntry[];
}

export interface TableResult {
	readonly table: Table;
	readonly entry: TableEntry;
	/** Entry text with every reference resolved. */
	readonly text: string;
	/** The roll that selected the entry, for a dice-keyed table. */
	readonly rolled?: { readonly expression: string; readonly total: number };
	/** Nested lookups that fed into the text, for a GM curious about the trail. */
	readonly nested: readonly string[];
}

export interface RollTableOptions {
	readonly rng?: RandomSource;
	readonly registry?: ContentRegistry;
	/**
	 * How many rounds of substitution to perform. Default 4. A self-referential
	 * table stops here with its last reference left visible in the text, rather
	 * than recursing forever.
	 */
	readonly maxDepth?: number;
}

export class TableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TableError";
	}
}

const REFERENCE = /\{\{(table|roll|pick|deck):([^}]+)\}\}/g;

function selectEntry(
	table: Table,
	rng: RandomSource,
): { entry: TableEntry; rolled?: { expression: string; total: number } } {
	if (table.dice) {
		const total = roll(table.dice, { rng }).total;
		const entry = table.entries.find((e) => e.range && total >= e.range[0] && total <= e.range[1]);
		if (!entry) {
			throw new TableError(
				`Table ${JSON.stringify(table.id)} has no entry for ${table.dice} = ${total}. ` +
					"Its ranges do not cover its dice; run tableProblems on it.",
			);
		}
		return { entry, rolled: { expression: table.dice, total } };
	}
	if (table.entries.length === 0) throw new TableError(`Table ${JSON.stringify(table.id)} has no entries`);
	return { entry: rng.weighted(table.entries, (e) => e.weight ?? 1) };
}

function interpolate(
	text: string,
	rng: RandomSource,
	registry: ContentRegistry,
	nested: string[],
	depth: number,
	maxDepth: number,
): string {
	// `depth` counts substitutions already done, so maxDepth is the number of
	// rounds rather than one more than it.
	if (depth >= maxDepth) return text;
	return text.replace(REFERENCE, (_match, kind: string, rawArg: string) => {
		const arg = rawArg.trim();
		try {
			if (kind === "roll") {
				const total = roll(arg, { rng }).total;
				nested.push(`roll ${arg} = ${total}`);
				return String(total);
			}
			if (kind === "pick") {
				const options = arg.split("|").map((option) => option.trim());
				if (options.length < 2) throw new TableError(`pick needs at least two options: ${JSON.stringify(arg)}`);
				return rng.pick(options);
			}
			if (kind === "deck") {
				const deck = registry.requireDeck(arg);
				const card = drawEphemeral(deck, { count: 1, rng })[0];
				nested.push(`deck ${arg} → ${card.name}`);
				return card.name;
			}
			const sub = registry.requireTable(arg);
			const picked = selectEntry(sub, rng);
			nested.push(
				`table ${sub.id}${picked.rolled ? ` ${picked.rolled.expression} = ${picked.rolled.total}` : ""}`,
			);
			return interpolate(picked.entry.text, rng, registry, nested, depth + 1, maxDepth);
		} catch (error) {
			// A broken reference must be visible in the output, not silently dropped:
			// a GM reading "[table:foo failed]" knows to fix their pack.
			return `[${kind}:${arg} failed: ${(error as Error).message}]`;
		}
	});
}

export function rollTable(table: Table, options: RollTableOptions = {}): TableResult {
	const rng = options.rng ?? defaultRandomSource();
	const registry = options.registry ?? emptyRegistry;
	const { entry, rolled } = selectEntry(table, rng);
	const nested: string[] = [];
	const text = interpolate(entry.text, rng, registry, nested, 0, options.maxDepth ?? 4);
	return { table, entry, text, rolled, nested };
}

/** Roll a table by id. Convenience for the common case. */
export function rollTableById(id: string, options: RollTableOptions & { registry: ContentRegistry }): TableResult {
	return rollTable(options.registry.requireTable(id), options);
}

export function formatTableResult(result: TableResult): string {
	const key = result.rolled ? ` (${result.rolled.expression} = ${result.rolled.total})` : "";
	return `**${result.table.name}**${key}: ${result.text}`;
}

/**
 * Problems with a table definition. Empty means it is well formed.
 *
 * The important checks are on dice-keyed tables: ranges must be contiguous with
 * no gaps or overlaps, and must cover exactly the dice's span. A gap means some
 * rolls have no result; an overlap means an entry is unreachable.
 */
export function tableProblems(table: Table): string[] {
	const problems: string[] = [];
	if (!table.id) problems.push("has no id");
	if (!table.name) problems.push("has no name");
	if (!table.provenance?.source) problems.push("has no provenance.source");
	if (table.entries.length === 0) {
		problems.push("has no entries");
		return problems;
	}
	for (const [i, entry] of table.entries.entries()) {
		if (!entry.text) problems.push(`entry ${i} has no text`);
	}

	if (!table.dice) {
		for (const [i, entry] of table.entries.entries()) {
			if (entry.weight !== undefined && !(entry.weight > 0)) {
				problems.push(`entry ${i} has a non-positive weight: ${entry.weight}`);
			}
			if (entry.range) problems.push(`entry ${i} has a range but the table is weighted, not dice-keyed`);
		}
		return problems;
	}

	let expression: ReturnType<typeof parse>;
	try {
		expression = parse(table.dice);
	} catch (error) {
		problems.push(`has an unparseable dice expression ${JSON.stringify(table.dice)}: ${(error as Error).message}`);
		return problems;
	}

	const missingRanges = table.entries.filter((entry) => !entry.range).length;
	if (missingRanges > 0) {
		problems.push(`${missingRanges} entr${missingRanges === 1 ? "y has" : "ies have"} no range on a dice-keyed table`);
		return problems;
	}

	const ranges = table.entries.map((entry) => entry.range!).sort((a, b) => a[0] - b[0]);
	for (const [i, range] of ranges.entries()) {
		if (range[1] < range[0]) problems.push(`range ${range[0]}-${range[1]} is inverted`);
		if (i === 0) continue;
		const previous = ranges[i - 1][1];
		if (range[0] === previous + 1) continue;
		problems.push(
			range[0] <= previous
				? `ranges overlap between ${previous} and ${range[0]}`
				: `gap in ranges between ${previous} and ${range[0]}`,
		);
	}

	// A simple NdX table should cover exactly N to N*X.
	if (expression.dice.length === 1 && expression.dice[0].mods.length === 0) {
		const die = expression.dice[0];
		const low = die.count;
		const high = die.count * die.sides;
		if (ranges[0][0] !== low) problems.push(`starts at ${ranges[0][0]} but ${table.dice} can roll ${low}`);
		const last = ranges[ranges.length - 1][1];
		if (last !== high) problems.push(`ends at ${last} but ${table.dice} can roll ${high}`);
	}

	return problems;
}

/** Every `{{...}}` reference in a table, for checking a pack hangs together. */
export function tableReferences(table: Table): Array<{ kind: string; id: string }> {
	const out: Array<{ kind: string; id: string }> = [];
	for (const entry of table.entries) {
		for (const match of entry.text.matchAll(REFERENCE)) {
			out.push({ kind: match[1], id: match[2].trim() });
		}
	}
	return out;
}
