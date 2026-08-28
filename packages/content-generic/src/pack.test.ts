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
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { licenceConformanceCases } from "@portent/core/testing";
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

});

// The licence rules now come from @portent/core/testing, so a fork publishing its
// own pack gets the same checks -- including the attribution ones it would not
// have thought to write -- instead of copying a test file that drifts.
const noticePath = new URL("../NOTICE.md", import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url).pathname, "utf8")) as {
	license: string;
};

describe("licence conformance", () => {
	for (const check of licenceConformanceCases({
	packageName: "@portent/content-generic",
	packs: [genericContent],
	// Original writing only. A third-party licence appearing here should fail:
	// adapted content belongs in a package that exists to carry it.
	allow: ["CC0-1.0", "public domain"],
	declaredLicense: manifest.license,
	noticeExists: existsSync(noticePath),
	notice: existsSync(noticePath) ? readFileSync(noticePath, "utf8") : undefined,
	})) {
		it(check.name, check.run);
	}
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
