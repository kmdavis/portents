import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	defaultEdition,
	describeRules,
	EDITIONS,
	editionLabel,
	editionNote,
	editionsFor,
	isEdition,
	isEditionOf,
	isRulesSystem,
	resolveEdition,
	RULES_SYSTEMS,
	SYSTEMS,
	systemLabel,
} from "./editions.ts";

describe("defaults", () => {
	// Both systems have had a revision that changed character creation, so a GM
	// that guesses wrong hands the player rules they never agreed to.
	it("prefers the newer printing", () => {
		assert.equal(defaultEdition("5e"), "2024");
		assert.equal(defaultEdition("pf2e"), "remaster");
	});

	it("gives a single-printing system no edition", () => {
		assert.equal(defaultEdition("generic"), undefined);
		assert.deepEqual(editionsFor("generic"), []);
	});

	it("lists editions newest first, so the head is always the default", () => {
		for (const spec of SYSTEMS) {
			if (spec.editions.length === 0) continue;
			assert.equal(defaultEdition(spec.system), spec.editions[0], spec.system);
		}
	});
});

describe("resolving a request", () => {
	it("falls back to the default when nothing is asked for", () => {
		assert.equal(resolveEdition("5e"), "2024");
		assert.equal(resolveEdition("5e", ""), "2024");
	});

	it("honours a valid older printing", () => {
		assert.equal(resolveEdition("5e", "2014"), "2014");
		assert.equal(resolveEdition("pf2e", "legacy"), "legacy");
	});

	it("refuses a printing from the other system instead of falling back", () => {
		assert.throws(() => resolveEdition("5e", "remaster"), /not a printing of "5e"/);
		assert.throws(() => resolveEdition("pf2e", "2024"), /not a printing of "pf2e"/);
	});

	it("refuses an edition nobody has heard of", () => {
		assert.throws(() => resolveEdition("5e", "3.5"), /Unknown edition/);
	});

	it("explains that a generic system has no printings", () => {
		assert.throws(() => resolveEdition("generic", "2024"), /has no editions/);
	});
});

describe("guards and labels", () => {
	it("recognises its own values", () => {
		for (const system of RULES_SYSTEMS) assert.ok(isRulesSystem(system));
		for (const edition of EDITIONS) assert.ok(isEdition(edition));
		assert.ok(!isRulesSystem("dnd"));
		assert.ok(!isEdition("2000"));
	});

	it("knows which editions belong to which system", () => {
		assert.ok(isEditionOf("5e", "2024"));
		assert.ok(!isEditionOf("5e", "remaster"));
	});

	it("labels and describes every edition", () => {
		for (const edition of EDITIONS) {
			assert.ok(editionLabel(edition).length > 2, edition);
			assert.ok(editionNote(edition).length > 10, edition);
		}
	});

	it("names no trademarks", () => {
		// The content has to be original and the labels have to avoid claiming
		// affiliation, so the printing is described rather than branded.
		const text = [
			...RULES_SYSTEMS.map((system) => systemLabel(system)),
			...EDITIONS.map((edition) => `${editionLabel(edition)} ${editionNote(edition)}`),
		]
			.join(" ")
			.toLowerCase();
		for (const mark of ["dungeons", "dragons", "d&d", "pathfinder", "wizards of the coast", "paizo"]) {
			assert.ok(!text.includes(mark), `label mentions ${mark}`);
		}
	});

	it("describes rules for a brief, with and without an edition", () => {
		assert.match(describeRules("5e", "2024"), /2024 revision — the current core rules/);
		assert.doesNotMatch(describeRules("generic"), /—/);
	});
});
