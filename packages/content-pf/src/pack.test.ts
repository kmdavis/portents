import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createRegistry, deckProblems } from "@portents/core";
import { licenceConformanceCases } from "@portents/core/testing";
import { genericContent } from "@portents/content-generic";
import { critFumbles, critHits, pf1eContent, pf2eContent, pf2eLegacyContent, pfPacks } from "./index.ts";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url).pathname, "utf8")) as {
	license: string;
	private?: boolean;
};

describe("licence conformance", () => {
	for (const check of licenceConformanceCases({
		packageName: "@portents/content-pf",
		packs: [...pfPacks],
		// Original writing only. There is no CC-BY reference document for these
		// systems, so CC-BY appearing here would mean something went wrong.
		allow: ["CC0-1.0"],
		declaredLicense: manifest.license,
		publishable: manifest.private !== true,
		noticeExists: false,
	})) {
		it(check.name, check.run);
	}

	it("carries no adapted content, so needs no NOTICE", () => {
		const licences = new Set(
			pfPacks.flatMap((pack) => [
				...(pack.decks ?? []).map((d) => d.provenance?.license),
				...(pack.sheets ?? []).map(() => "CC0-1.0"),
			]),
		);
		assert.deepEqual([...licences].sort(), ["CC0-1.0"]);
	});

	it("names no trademark", () => {
		const prose = [
			...pfPacks.map((p) => `${p.name} ${p.provenance?.source ?? ""}`),
			...[critHits, critFumbles].flatMap((d) => d.cards.map((c) => `${c.name} ${c.text ?? ""}`)),
		]
			.join(" ")
			.toLowerCase();
		for (const mark of ["pathfinder", "paizo", "golarion", "lost omens"]) {
			assert.ok(!prose.includes(mark), `content mentions ${mark}`);
		}
	});
});

describe("the crit decks", () => {
	it("are well formed", () => {
		assert.deepEqual(deckProblems(critHits), []);
		assert.deepEqual(deckProblems(critFumbles), []);
	});

	it("cost actions rather than turns", () => {
		// The reason these override the generic decks at all. A generic card can say
		// "lose your next turn"; in a three-action system that is a different game.
		const all = [...critHits.cards, ...critFumbles.cards].map((c) => c.text ?? "").join(" ").toLowerCase();
		assert.match(all, /lose (?:one|your next) action/);
		assert.doesNotMatch(all, /lose your next turn/, "a lost-turn cost survived");
	});

	it("declare their overrides of the generic decks", () => {
		assert.deepEqual(pf2eContent.overrides, [
			{ kind: "deck", id: "crit-hits", reason: "action-economy costs instead of lost turns" },
			{ kind: "deck", id: "crit-fumbles", reason: "action-economy costs instead of lost turns" },
		]);
	});

	it("actually replace the generic decks when layered", () => {
		const registry = createRegistry([genericContent, pf2eContent]);
		assert.equal(registry.requireDeck("crit-hits").description, critHits.description);
		assert.equal(registry.appliedOverrides().length, 2);
	});

	it("give every card a distinct name", () => {
		for (const deck of [critHits, critFumbles]) {
			const names = deck.cards.map((c) => c.name);
			assert.equal(new Set(names).size, names.length, `${deck.id} repeats a card name`);
		}
	});
});

describe("sheet scaffolds", () => {
	it("resolves each printing from its system line", () => {
		const registry = createRegistry([genericContent, pf1eContent, pf2eLegacyContent, pf2eContent]);
		assert.equal(registry.sheetFor("pf2e (remaster)")?.id, "pf2e-remaster");
		assert.equal(registry.sheetFor("pf2e (legacy)")?.id, "pf2e-legacy");
		assert.equal(registry.sheetFor("pf1e")?.id, "pf1e");
		assert.equal(registry.sheetFor("Pathfinder 2E")?.id, "pf2e-remaster");
	});

	it("tracks hero points and focus points on a second-edition sheet", () => {
		const status = pf2eContent.sheets![0].status!;
		assert.ok(status.includes("Hero Points"));
		assert.ok(status.includes("Focus Points"));
		assert.ok(status.includes("Dying"));
	});

	it("keeps alignment on the legacy printing only", () => {
		assert.ok(pf2eLegacyContent.sheets![0].status!.includes("Alignment"));
		assert.ok(!pf2eContent.sheets![0].status!.includes("Alignment"));
	});

	it("treats first edition as a different game", () => {
		const status = pf1eContent.sheets![0].status!;
		for (const key of ["BAB", "CMD", "Fortitude", "Reflex", "Will"]) assert.ok(status.includes(key), key);
		assert.ok(!status.includes("Hero Points"));
	});

	it("suggests no values, only key names", () => {
		for (const pack of pfPacks) {
			for (const key of pack.sheets![0].status ?? []) {
				assert.equal(typeof key, "string");
				assert.doesNotMatch(key, /\d/, `${key} looks like it carries a value`);
			}
		}
	});
});
