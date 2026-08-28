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
import type { Table } from "../tables/table.ts";

/** Where a pack's content came from, and under what licence. */
export interface Provenance {
	readonly source: string;
	readonly license?: string;
}

/** Anything a pack can contribute. */
export interface ContentPack {
	readonly id: string;
	readonly name?: string;
	readonly decks?: readonly Deck[];
	readonly tables?: readonly Table[];
	readonly provenance?: Provenance;
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
	constructor(kind: "deck" | "table", id: string) {
		super(`Two packs both define the ${kind} ${JSON.stringify(id)}; ids must be unique across loaded packs`);
		this.name = "DuplicateContentError";
	}
}

/** Read-only content lookup. */
export interface ContentRegistry {
	deck(id: string): Deck | undefined;
	table(id: string): Table | undefined;
	/** Throws {@link UnknownContentError} listing what is available. */
	requireDeck(id: string): Deck;
	requireTable(id: string): Table;
	deckIds(): string[];
	tableIds(): string[];
}

export interface RegistryOptions {
	/**
	 * Let a later pack replace an earlier pack's entry with the same id. Off by
	 * default, because a silent override is how a user wonders why their custom
	 * table is being ignored.
	 */
	readonly allowOverride?: boolean;
}

/**
 * Index one or more packs by id.
 *
 * Order matters only when `allowOverride` is set, in which case later packs win —
 * which is how a user's own content replaces a bundled pack.
 */
export function createRegistry(
	packs: readonly ContentPack[],
	options: RegistryOptions = {},
): ContentRegistry {
	const decks = new Map<string, Deck>();
	const tables = new Map<string, Table>();

	for (const pack of packs) {
		for (const deck of pack.decks ?? []) {
			if (decks.has(deck.id) && !options.allowOverride) throw new DuplicateContentError("deck", deck.id);
			decks.set(deck.id, deck);
		}
		for (const table of pack.tables ?? []) {
			if (tables.has(table.id) && !options.allowOverride) throw new DuplicateContentError("table", table.id);
			tables.set(table.id, table);
		}
	}

	return {
		deck: (id) => decks.get(id),
		table: (id) => tables.get(id),
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
	};
}

/** An empty registry, for code paths that must not reach for content. */
export const emptyRegistry: ContentRegistry = createRegistry([]);
