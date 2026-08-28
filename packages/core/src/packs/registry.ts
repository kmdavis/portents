/**
 * Content packs: the types content is written against, and a registry to look it
 * up by id.
 *
 * The library holds the *mechanism* — how a deck depletes, how a dice-keyed table
 * is indexed, how the oracle's likelihood ladder works. A pack holds the *words*.
 * `@portent/content` is one pack; anyone can write another.
 *
 * Lookups go through an injected registry rather than a module-level cache read
 * from disk. That is what lets the same code run in a browser, lets a caller mix
 * packs, and lets a test supply three fake tables instead of the whole corpus.
 */

import type { Deck } from "../decks/deck.ts";
export type { Provenance } from "./attribution.ts";
import type { Provenance } from "./attribution.ts";
import { matchBySystemAlias, matchSheet, type SheetTemplate } from "../sheets/template.ts";
import type { Table } from "../tables/table.ts";

/** Anything a pack can contribute. */
export interface ContentPack {
	readonly id: string;
	readonly name?: string;
	readonly decks?: readonly Deck[];
	readonly tables?: readonly Table[];
	/** Sheet scaffolds this pack offers. See {@link SheetTemplate}. */
	readonly sheets?: readonly SheetTemplate[];
	/** GM guidance for the systems this pack covers. See {@link SystemGuidance}. */
	readonly guidance?: readonly SystemGuidance[];
	readonly provenance?: Provenance;
	/**
	 * Content ids this pack deliberately replaces.
	 *
	 * A system pack usually wants its own version of something generic -- its own
	 * wild-magic table, its own crit deck. Declaring the id makes that intentional
	 * and reviewable, and keeps the registry able to reject the collisions nobody
	 * meant: two packs that both define `traps` without either claiming it.
	 *
	 * The declaration lives on the pack rather than in `package.json` because one
	 * package can export several packs, and because it must be typecheckable
	 * against the ids the pack actually defines.
	 */
	readonly overrides?: readonly ContentOverride[];
}

/**
 * How to run a game in one system, as markdown.
 *
 * Guidance lives with the content rather than with a harness because it answers a
 * question about the *system*, and every consumer needs the same answer -- the pi
 * extension injects it into a prompt, a browser UI can show it in a panel. It used
 * to sit in the pi package, which meant a rules change touched two packages: the
 * sheet scaffold declaring `Hero Points` here, and the prose explaining hero points
 * over there.
 *
 * **Say nothing about tools.** A pack cannot know what its consumer calls things.
 * Describe the mechanic and who rolls it; let the harness say which tool to use.
 * A test enforces this.
 */
export interface SystemGuidance {
	readonly id: string;
	/**
	 * System lines this guidance answers to, e.g. `["5e (2024)", "dnd 5e 2024"]`.
	 *
	 * Matched with the same alias rule as sheet scaffolds, so the two cannot disagree
	 * about what a system line means.
	 */
	readonly aliases: readonly string[];
	/** Markdown. Headings start at `#`; the consumer re-levels if it needs to. */
	readonly body: string;
}

/** One deliberate replacement of another pack's entry. */
export interface ContentOverride {
	readonly kind: "deck" | "table" | "sheet" | "guidance";
	readonly id: string;
	/** Why, in a few words. Shows up in the registry report a user can print. */
	readonly reason?: string;
}

export class UnknownContentError extends Error {
	readonly kind: "deck" | "table";
	readonly requested: string;
	constructor(kind: "deck" | "table", requested: string, available: readonly string[]) {
		const list = available.length > 0 ? [...available].sort().join(", ") : "none loaded";
		super(`Unknown ${kind} ${JSON.stringify(requested)}. Available: ${list}`);
		this.name = "UnknownContentError";
		this.kind = kind;
		this.requested = requested;
	}
}

export class DuplicateContentError extends Error {
	constructor(kind: ContentKind, id: string, packs: readonly string[]) {
		super(
			`Two packs both define the ${kind} ${JSON.stringify(id)} (${packs.join(" then ")}), ` +
				`and neither declares it as an override. If ${JSON.stringify(packs.at(-1))} means to replace it, ` +
				`add { kind: "${kind}", id: ${JSON.stringify(id)} } to its \`overrides\`. ` +
				"If not, one of them needs a different id.",
		);
		this.name = "DuplicateContentError";
	}
}

/**
 * An override that overrides nothing.
 *
 * Reported rather than ignored: a stale declaration means either the id was
 * renamed upstream and this pack is no longer replacing what it thinks, or the
 * pack order is wrong and the override is being applied before its target loads.
 * Both are silent failures without this.
 */
export class UnusedOverrideError extends Error {
	constructor(packId: string, override: ContentOverride) {
		super(
			`Pack ${JSON.stringify(packId)} declares an override of the ${override.kind} ` +
				`${JSON.stringify(override.id)}, but nothing earlier defines it. Either the id changed, ` +
				"or this pack is loaded before the one it means to override.",
		);
		this.name = "UnusedOverrideError";
	}
}

export type ContentKind = "deck" | "table" | "sheet" | "guidance";

/** What replaced what, so a user can print the answer to "why am I getting this?". */
export interface AppliedOverride extends ContentOverride {
	readonly by: string;
	readonly replaced: string;
}

/** Read-only content lookup. */
export interface ContentRegistry {
	deck(id: string): Deck | undefined;
	table(id: string): Table | undefined;
	sheet(id: string): SheetTemplate | undefined;
	/** Throws {@link UnknownContentError} listing what is available. */
	requireDeck(id: string): Deck;
	requireTable(id: string): Table;
	deckIds(): string[];
	tableIds(): string[];
	sheetIds(): string[];
	/**
	 * The best sheet scaffold for a system line, or `undefined`.
	 *
	 * Matching is on declared aliases only. A system nobody claimed gets nothing
	 * back rather than a guess, because a wrong scaffold is written to a file the
	 * player hand-edits and then lives there.
	 */
	sheetFor(system: string): SheetTemplate | undefined;
	/** Every guidance id loaded, sorted. */
	guidanceIds(): string[];
	/**
	 * GM guidance for a system line, or `undefined`.
	 *
	 * Same alias-only matching as {@link ContentRegistry.sheetFor}, and the same
	 * refusal to guess: a system nobody wrote guidance for gets nothing, so the
	 * caller can say it is falling back instead of silently serving another
	 * system's rules.
	 */
	guidanceFor(system: string): SystemGuidance | undefined;
	/** Every override that actually fired, in application order. */
	appliedOverrides(): readonly AppliedOverride[];
}

export interface RegistryOptions {
	/**
	 * Let any later pack replace an earlier entry, without declaring it.
	 *
	 * A blunt instrument, kept for a caller loading a user's own scratch pack where
	 * ceremony would be silly. Prefer declaring `overrides` on the pack: this flag
	 * also suppresses the collisions nobody meant.
	 */
	readonly allowOverride?: boolean;
	/**
	 * Report an override that matched nothing. On by default.
	 *
	 * A stale declaration means the pack is not replacing what it thinks it is,
	 * which is silent without this.
	 */
	readonly strictOverrides?: boolean;
}

/**
 * Index one or more packs by id.
 *
 * **Order is the override order**: later packs win, but only where they declared
 * the id in `overrides`. An undeclared collision throws, so a system pack
 * replacing a generic table is a reviewable line of code while two packs that
 * both happen to define `traps` is still an error.
 */
export function createRegistry(
	packs: readonly ContentPack[],
	options: RegistryOptions = {},
): ContentRegistry {
	const decks = new Map<string, Deck>();
	const tables = new Map<string, Table>();
	const sheets = new Map<string, SheetTemplate>();
	const guidance = new Map<string, SystemGuidance>();
	const owners = new Map<string, string>();
	const applied: AppliedOverride[] = [];

	const store = <T extends { id: string }>(
		kind: ContentKind,
		map: Map<string, T>,
		pack: ContentPack,
		item: T,
	) => {
		const key = `${kind}:${item.id}`;
		const previous = owners.get(key);
		if (previous !== undefined) {
			const declared = (pack.overrides ?? []).find((o) => o.kind === kind && o.id === item.id);
			if (!declared && !options.allowOverride) {
				throw new DuplicateContentError(kind, item.id, [previous, pack.id]);
			}
			if (declared) applied.push({ ...declared, by: pack.id, replaced: previous });
		}
		owners.set(key, pack.id);
		map.set(item.id, item);
	};

	for (const pack of packs) {
		// Overrides are checked before this pack's own content lands, so "nothing
		// earlier defines it" means exactly that.
		if (options.strictOverrides !== false) {
			for (const override of pack.overrides ?? []) {
				if (!owners.has(`${override.kind}:${override.id}`)) {
					throw new UnusedOverrideError(pack.id, override);
				}
			}
		}
		for (const deck of pack.decks ?? []) store("deck", decks, pack, deck);
		for (const table of pack.tables ?? []) store("table", tables, pack, table);
		for (const sheet of pack.sheets ?? []) store("sheet", sheets, pack, sheet);
		for (const entry of pack.guidance ?? []) store("guidance", guidance, pack, entry);
	}

	return {
		deck: (id) => decks.get(id),
		table: (id) => tables.get(id),
		sheet: (id) => sheets.get(id),
		requireDeck(id) {
			const found = decks.get(id);
			if (!found) throw new UnknownContentError("deck", id, [...decks.keys()]);
			return found;
		},
		requireTable(id) {
			const found = tables.get(id);
			if (!found) throw new UnknownContentError("table", id, [...tables.keys()]);
			return found;
		},
		deckIds: () => [...decks.keys()].sort(),
		tableIds: () => [...tables.keys()].sort(),
		guidanceIds: () => [...guidance.keys()].sort(),
		// Later packs first, so a system pack's guidance beats a generic fallback.
		guidanceFor: (system) => matchBySystemAlias([...guidance.values()].reverse(), system),
		sheetIds: () => [...sheets.keys()].sort(),
		// Later packs are checked first, so a system template beats the generic one.
		sheetFor: (system) => matchSheet([...sheets.values()].reverse(), system),
		appliedOverrides: () => applied,
	};
}

/** An empty registry, for code paths that must not reach for content. */
export const emptyRegistry: ContentRegistry = createRegistry([]);
