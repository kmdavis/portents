import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createRegistry, rollTable, seededRandomSource, tableProblems } from "@portents/core";
import { licenceConformanceCases } from "@portents/core/testing";
import { genericContent } from "@portents/content-generic";
import { dnd2014Content, dnd2024Content, dndPacks, SRD_5_1_STATEMENT, SRD_5_2_1_STATEMENT } from "./index.ts";

const noticePath = new URL("../NOTICE.md", import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url).pathname, "utf8")) as {
	license: string;
	private?: boolean;
};

const items = dndPacks.flatMap((pack) => [
	...(pack.tables ?? []).map((t) => ({ id: `table:${t.id}`, provenance: t.provenance })),
	...(pack.decks ?? []).map((d) => ({ id: `deck:${d.id}`, provenance: d.provenance })),
	...(pack.provenance ? [{ id: `pack:${pack.id}`, provenance: pack.provenance }] : []),
]);

describe("licence conformance", () => {
	for (const check of licenceConformanceCases({
		packageName: "@portents/content-dnd",
		packs: [...dndPacks],
		// This package exists to carry adapted SRD material, so CC-BY is expected
		// here in a way it would not be in content-generic.
		allow: ["CC0-1.0", "CC-BY-4.0", "public domain"],
		declaredLicense: manifest.license,
		publishable: manifest.private !== true,
		noticeExists: existsSync(noticePath),
		notice: existsSync(noticePath) ? readFileSync(noticePath, "utf8") : undefined,
	})) {
		it(check.name, check.run);
	}
});

describe("the SRD attribution statements", () => {
	it("are reproduced verbatim, including the licence URLs", () => {
		// Editing these for style would break the condition they exist to satisfy.
		assert.match(SRD_5_2_1_STATEMENT, /^This work includes material from the System Reference Document 5\.2\.1/);
		assert.match(SRD_5_2_1_STATEMENT, /available at https:\/\/www\.dndbeyond\.com\/srd/);
		assert.match(SRD_5_1_STATEMENT, /^This work includes material taken from the System Reference Document 5\.1/);
		for (const statement of [SRD_5_2_1_STATEMENT, SRD_5_1_STATEMENT]) {
			assert.match(statement, /Creative Commons Attribution 4\.0 International License/);
			assert.match(statement, /creativecommons\.org\/licenses\/by\/4\.0\/legalcode/);
			assert.match(statement, /Wizards of the Coast LLC/);
		}
	});

	it("appear in the shipped NOTICE", () => {
		const notice = readFileSync(noticePath, "utf8");
		assert.match(notice, /System Reference Document 5\.2\.1/);
		assert.match(notice, /Wizards of the Coast LLC/);
		assert.match(notice, /Modified:\*\* yes/, "CC-BY §3(a)(1)(B) requires indicating modification");
	});
});

describe("what is deliberately absent", () => {
	it("ships no wild-magic table, because no SRD contains one", () => {
		// Verified against SRD 5.1 and 5.2.1: both ship Draconic as the only
		// sorcerous origin, so the surge table is rulebook content and cannot be
		// published here. The generic pack's own wild-magic deck is original.
		const ids = dndPacks.flatMap((pack) => [
			...(pack.tables ?? []).map((t) => t.id),
			...(pack.decks ?? []).map((d) => d.id),
		]);
		assert.ok(!ids.some((id) => /wild.?magic/i.test(id)), `found a wild-magic entry: ${ids.join(", ")}`);
	});

	it("names no trademark beyond the attribution the SRD requires", () => {
		// The SRDs permit the required statement and a "5E compatible" claim, and
		// explicitly ask for no other attribution.
		const prose = [
			...items.map((i) => i.provenance?.source ?? ""),
			...dndPacks.map((p) => p.name ?? ""),
		].join(" ").toLowerCase();
		for (const mark of ["dungeons", "dragons", "d&d"]) {
			assert.ok(!prose.includes(mark), `pack prose mentions ${mark}`);
		}
	});
});

describe("the traps table", () => {
	it("is well formed and covers its dice", () => {
		assert.deepEqual(tableProblems(dnd2024Content.tables![0]), []);
	});

	it("has one entry per face, all complete sentences", () => {
		const table = dnd2024Content.tables![0];
		assert.equal(table.entries.length, 8);
		for (const entry of table.entries) {
			assert.match(entry.text, /^\*\*[^*]+\*\* \(.+\)\. Triggered when .+\.$/, entry.text);
			assert.doesNotMatch(entry.text, / the\.$/, `truncated by a line wrap: ${entry.text}`);
		}
	});

	it("declares its override of the generic table", () => {
		assert.deepEqual(dnd2024Content.overrides, [
			{ kind: "table", id: "traps", reason: "system-specific traps with level bands" },
		]);
	});

	it("actually replaces the generic table when layered", () => {
		const registry = createRegistry([genericContent, dnd2024Content]);
		const rolled = rollTable(registry.requireTable("traps"), { rng: seededRandomSource("t"), registry });
		assert.match(rolled.text, /levels/, "got the generic table, not the system one");
		assert.equal(registry.appliedOverrides().length, 1);
	});
});

describe("sheet scaffolds", () => {
	it("offers one per printing, matched by the system line", () => {
		const registry = createRegistry([genericContent, dnd2014Content, dnd2024Content]);
		assert.equal(registry.sheetFor("5e (2024)")?.id, "dnd-5e-2024");
		assert.equal(registry.sheetFor("5e (2014)")?.id, "dnd-5e-2014");
		assert.equal(registry.sheetFor("D&D 5E")?.id, "dnd-5e-2014");
	});

	it("gives the 2024 printing its own section", () => {
		const headings = dnd2024Content.sheets![0].sections.map((s) => (typeof s === "string" ? s : s.heading));
		assert.ok(headings.includes("Weapon Mastery"));
	});

	it("suggests status key names without asserting any values", () => {
		// Names and order only: a default number would be a rules claim.
		for (const pack of [dnd2014Content, dnd2024Content]) {
			const status = pack.sheets![0].status!;
			assert.ok(status.includes("HP"));
			for (const key of status) assert.equal(typeof key, "string");
		}
	});
});
