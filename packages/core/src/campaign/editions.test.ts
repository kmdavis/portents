import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	defaultEdition,
	describeRules,
	editionNote,
	editionsFor,
	formatSystem,
	isEditionOf,
	KNOWN_SYSTEMS,
	knownSystem,
	parseSystem,
	resolveEdition,
	resolveSystemLine,
	SystemError,
	systemLabel,
} from "./editions.ts";

describe("the freeform line", () => {
	it("splits a system from its printing", () => {
		assert.deepEqual(parseSystem("5e (2024)"), { system: "5e", edition: "2024" });
		assert.deepEqual(parseSystem("pf2e (remaster)"), { system: "pf2e", edition: "remaster" });
	});

	it("accepts a system with no printing", () => {
		assert.deepEqual(parseSystem("generic"), { system: "generic" });
		assert.deepEqual(parseSystem("Call of Cthulhu 7e"), { system: "Call of Cthulhu 7e" });
	});

	it("tolerates spacing a person would actually type", () => {
		for (const line of ["5e (2024)", "5e(2024)", "  5e   (2024)  ", "5e ( 2024 )"]) {
			assert.deepEqual(parseSystem(line), { system: "5e", edition: "2024" }, line);
		}
	});

	it("treats empty parentheses as no printing", () => {
		assert.deepEqual(parseSystem("5e ()"), { system: "5e" });
	});

	it("keeps a system whose name contains a number or a dash", () => {
		assert.deepEqual(parseSystem("Dragonbane"), { system: "Dragonbane" });
		assert.deepEqual(parseSystem("13th Age (2e)"), { system: "13th Age", edition: "2e" });
	});

	it("refuses an empty line or one that is only a parenthetical", () => {
		assert.throws(() => parseSystem("   "), SystemError);
		assert.throws(() => parseSystem("(2024)"), /Cannot read a system/);
	});

	it("round-trips through formatSystem", () => {
		for (const line of ["5e (2024)", "generic", "Call of Cthulhu 7e", "13th Age (2e)"]) {
			const { system, edition } = parseSystem(line);
			assert.equal(formatSystem(system, edition), line.replace(/\s+/g, " ").trim(), line);
		}
	});

	it("omits empty parentheses when formatting", () => {
		assert.equal(formatSystem("generic", ""), "generic");
		assert.equal(formatSystem("generic", undefined), "generic");
		assert.equal(formatSystem("  5e  ", "  2024  "), "5e (2024)");
	});
});

describe("defaults for a known system", () => {
	it("prefers the newer printing", () => {
		// Both have had a revision that changed character creation, so a GM that
		// guesses wrong hands the player rules they never agreed to.
		assert.equal(defaultEdition("5e"), "2024");
		assert.equal(defaultEdition("pf2e"), "remaster");
	});

	it("lists printings newest first, so the head is always the default", () => {
		for (const system of KNOWN_SYSTEMS) {
			if (system.editions.length === 0) continue;
			assert.equal(defaultEdition(system.id), system.editions[0], system.id);
		}
	});

	it("gives a single-printing system none", () => {
		assert.equal(defaultEdition("generic"), undefined);
		assert.deepEqual(editionsFor("generic"), []);
	});

	it("matches a system name case-insensitively", () => {
		assert.ok(knownSystem("5E"));
		assert.equal(defaultEdition("PF2E"), "remaster");
	});
});

describe("an unknown system is nobody's business to second-guess", () => {
	it("is accepted without a default", () => {
		assert.ok(!knownSystem("Call of Cthulhu 7e"));
		assert.equal(defaultEdition("Call of Cthulhu 7e"), undefined);
	});

	it("keeps whatever printing it was given, verbatim", () => {
		assert.equal(resolveEdition("Blades in the Dark", "2nd printing"), "2nd printing");
		const resolved = resolveSystemLine("Traveller (Mongoose 2e)");
		assert.deepEqual(resolved, { system: "Traveller", edition: "Mongoose 2e" });
	});

	it("does not invent a printing it was not given", () => {
		assert.deepEqual(resolveSystemLine("Dragonbane"), { system: "Dragonbane" });
	});
});

describe("validating a known system's printing", () => {
	it("fills in the default when none is given", () => {
		assert.deepEqual(resolveSystemLine("5e"), { system: "5e", edition: "2024" });
		assert.deepEqual(resolveSystemLine("pf2e"), { system: "pf2e", edition: "remaster" });
	});

	it("honours an explicitly older printing", () => {
		assert.deepEqual(resolveSystemLine("5e (2014)"), { system: "5e", edition: "2014" });
		assert.deepEqual(resolveSystemLine("pf2e (legacy)"), { system: "pf2e", edition: "legacy" });
	});

	it("catches a typo rather than recording a printing that does not exist", () => {
		assert.throws(() => resolveSystemLine("5e (2025)"), /Unknown printing "2025" for "5e"/);
		assert.throws(() => resolveSystemLine("5e (2025)"), /Use one of: 2024, 2014/);
	});

	it("says which game a misplaced printing belongs to", () => {
		assert.throws(() => resolveSystemLine("5e (remaster)"), /"remaster" is a printing of "pf2e", not "5e"/);
		assert.throws(() => resolveSystemLine("pf2e (2024)"), /"2024" is a printing of "5e", not "pf2e"/);
	});

	it("never falls back silently", () => {
		// A silent fallback leaves the player unable to notice they were handed the
		// wrong character creation rules.
		assert.throws(() => resolveEdition("5e", "remaster"), SystemError);
	});

	it("explains that a single-printing system has none", () => {
		assert.throws(() => resolveSystemLine("generic (2024)"), /has no printings/);
	});

	it("knows which printings belong to which system", () => {
		assert.ok(isEditionOf("5e", "2024"));
		assert.ok(isEditionOf("5e", "2014"));
		assert.ok(!isEditionOf("5e", "remaster"));
	});
});

describe("passing the two separately", () => {
	it("accepts an edition alongside a bare system", () => {
		assert.deepEqual(resolveSystemLine("5e", "2014"), { system: "5e", edition: "2014" });
	});

	it("accepts a redundant but agreeing pair", () => {
		assert.deepEqual(resolveSystemLine("5e (2014)", "2014"), { system: "5e", edition: "2014" });
	});

	it("refuses a conflicting pair rather than quietly preferring one", () => {
		assert.throws(() => resolveSystemLine("5e (2024)", "2014"), /says "2024" but the edition given was "2014"; pick one/);
	});
});

describe("labels", () => {
	it("describes a known system and printing for a brief", () => {
		assert.match(describeRules("5e", "2024"), /2024 — the current core rules/);
		assert.match(describeRules("pf2e", "remaster"), /reworked spell schools/);
	});

	it("falls back to the bare name for an unknown system", () => {
		assert.equal(describeRules("Call of Cthulhu 7e"), "Call of Cthulhu 7e");
		assert.equal(describeRules("Dragonbane", "2e"), "Dragonbane, 2e");
	});

	it("has a note for every printing of every known system", () => {
		for (const system of KNOWN_SYSTEMS) {
			for (const edition of system.editions) {
				assert.ok((editionNote(system.id, edition) ?? "").length > 10, `${system.id} ${edition}`);
			}
		}
	});

	it("names no trademarks", () => {
		// Content has to be original and labels must not claim affiliation, so the
		// printing is described rather than branded.
		const text = KNOWN_SYSTEMS.flatMap((system) => [
			systemLabel(system.id),
			...system.editions.map((edition) => `${edition} ${editionNote(system.id, edition)}`),
		])
			.join(" ")
			.toLowerCase();
		for (const mark of ["dungeons", "dragons", "d&d", "pathfinder", "wizards of the coast", "paizo"]) {
			assert.ok(!text.includes(mark), `label mentions ${mark}`);
		}
	});
});
