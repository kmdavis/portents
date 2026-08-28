/**
 * Tests for the pack as a whole.
 *
 * Individual mechanisms are tested in `@portent/core`. What matters here is that
 * this data is well formed, internally consistent, and complete enough for the
 * things that depend on it: the oracle needs six specific tables, and every
 * `{{table:...}}` reference has to resolve or a GM gets a sentence with a hole
 * in it.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	createRegistry,
	deckProblems,
	deckSize,
	drawEphemeral,
	expandDeck,
	missingOracleTables,
	ORACLE_TABLES,
	rollTable,
	tableProblems,
	tableReferences,
} from "@portent/core";
import { decks } from "./decks/index.ts";
import { genericContent } from "./index.ts";
import { tables } from "./tables/index.ts";

const registry = createRegistry([genericContent]);

describe("the pack loads", () => {
	it("indexes without duplicate ids", () => {
		assert.ok(registry.deckIds().length >= 6, `only ${registry.deckIds().length} decks`);
		assert.ok(registry.tableIds().length >= 20, `only ${registry.tableIds().length} tables`);
	});

	it("has unique ids across decks and across tables", () => {
		assert.equal(new Set(decks.map((d) => d.id)).size, decks.length);
		assert.equal(new Set(tables.map((t) => t.id)).size, tables.length);
	});

	it("uses kebab-case ids", () => {
		for (const item of [...decks, ...tables]) {
			assert.match(item.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${item.id} is not kebab-case`);
		}
	});

	it("declares provenance on everything", () => {
		for (const item of [...decks, ...tables]) {
			assert.ok(item.provenance?.source, `${item.id} has no provenance.source`);
		}
	});

	it("declares a licence for everything, and reproduces nothing proprietary", () => {
		// A standard 54-card French deck is public domain, not my writing. Everything
		// else is original and CC0. Nothing may be under any other licence, which is
		// what stops a copied table from a published rulebook slipping in.
		const allowed = new Set(["CC0", "public domain"]);
		for (const item of [...decks, ...tables]) {
			const licence = item.provenance?.license;
			assert.ok(licence, `${item.id} declares no licence`);
			assert.ok(allowed.has(licence!), `${item.id} is under ${licence}, which is not an allowed licence`);
			if (licence === "CC0") {
				assert.match(item.provenance!.source, /original writing/, `${item.id} claims CC0 but not authorship`);
			}
		}
	});

	it("keeps original writing as the overwhelming majority", () => {
		const all = [...decks, ...tables];
		const original = all.filter((item) => item.provenance?.license === "CC0");
		assert.ok(original.length >= all.length - 1, `${all.length - original.length} items are not original writing`);
	});
});

describe("every deck", () => {
	for (const deck of decks) {
		describe(deck.id, () => {
			it("is well formed", () => {
				assert.deepEqual(deckProblems(deck), []);
			});

			it("expands to the size it claims", () => {
				assert.equal(expandDeck(deck).length, deckSize(deck));
			});

			it("can be drawn from", () => {
				const cards = drawEphemeral(deck, { count: Math.min(3, deckSize(deck)) });
				assert.ok(cards.length > 0);
				for (const card of cards) assert.ok(card.name.length > 0);
			});

			it("only references content that exists", () => {
				for (const card of deck.cards) {
					for (const match of (card.text ?? "").matchAll(/\{\{(table|deck):([^}]+)\}\}/g)) {
						const [, kind, id] = match;
						const found = kind === "table" ? registry.table(id.trim()) : registry.deck(id.trim());
						assert.ok(found, `${deck.id} references unknown ${kind} ${JSON.stringify(id)}`);
					}
				}
			});
		});
	}

	it("includes a full 54-card French deck", () => {
		assert.equal(deckSize(registry.requireDeck("playing-cards")), 54);
	});
});

describe("every table", () => {
	for (const table of tables) {
		describe(table.id, () => {
			it("is well formed, with no gaps or overlaps", () => {
				assert.deepEqual(tableProblems(table), []);
			});

			it("only references content that exists", () => {
				for (const reference of tableReferences(table)) {
					if (reference.kind === "table") {
						assert.ok(registry.table(reference.id), `unknown table ${JSON.stringify(reference.id)}`);
					} else if (reference.kind === "deck") {
						assert.ok(registry.deck(reference.id), `unknown deck ${JSON.stringify(reference.id)}`);
					} else if (reference.kind === "pick") {
						assert.ok(reference.id.includes("|"), `pick needs options: ${reference.id}`);
					}
				}
			});

			it("resolves every entry without leaving a failure marker", () => {
				// Enough rolls to hit most entries and force the nested lookups.
				for (let i = 0; i < 60; i++) {
					const result = rollTable(table, { registry });
					assert.ok(!result.text.includes("failed:"), `interpolation failed: ${result.text}`);
					assert.ok(!result.text.includes("{{"), `unresolved reference: ${result.text}`);
					assert.ok(result.text.trim().length > 0, "produced empty text");
				}
			});
		});
	}
});

describe("the oracle can run on this pack", () => {
	it("provides every table the oracle needs", () => {
		assert.deepEqual(missingOracleTables(registry), []);
	});

	it("names those tables explicitly, so a fork knows what to supply", () => {
		for (const id of Object.values(ORACLE_TABLES)) {
			assert.ok(registry.table(id), `missing ${id}`);
		}
	});
});
