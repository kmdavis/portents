import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	appendToSection,
	applyDelta,
	createSheet,
	getSection,
	isConsistent,
	isGeneratedSection,
	listSections,
	parseSheet,
	patchMap,
	patchStatus,
	setMeta,
	setSection,
	type Sheet,
	SheetError,
	sheetProblems,
	status,
	statusDigest,
	statusValue,
	stringifySheet,
	syncGeneratedSections,
} from "./sheet.ts";

function brannoc(): Sheet {
	return createSheet({
		name: "Brannoc Thistlewood",
		concept: "Level 3 Wood Elf Ranger (Hunter)",
		meta: { system: "5e", edition: "2024" },
		status: { Level: 3, HP: "22/26", AC: 15, Conditions: "none" },
		abilities: { STR: "12 (+1)", DEX: "17 (+3)" },
		sections: ["Equipment", { heading: "Notes", body: "Owes the harbourmaster 12 gp." }],
	});
}

describe("createSheet", () => {
	it("puts the name in frontmatter and in an h1", () => {
		const sheet = brannoc();
		assert.equal(sheet.data.name, "Brannoc Thistlewood");
		assert.match(sheet.body, /^# Brannoc Thistlewood$/m);
	});

	it("carries arbitrary metadata", () => {
		const sheet = brannoc();
		assert.equal(sheet.data.system, "5e");
		assert.equal(sheet.data.edition, "2024");
	});

	it("does not let meta overwrite name or concept", () => {
		const sheet = createSheet({ name: "Real", meta: { name: "Fake", concept: "Fake" } });
		assert.equal(sheet.data.name, "Real");
	});

	it("requires a name", () => {
		assert.throws(() => createSheet({ name: "  " }), SheetError);
	});

	it("creates the requested sections in order, stubbing empty ones", () => {
		const sheet = brannoc();
		const sections = listSections(sheet);
		assert.deepEqual(sections, ["Status", "Ability Scores", "Equipment", "Notes"]);
		assert.equal(getSection(sheet, "Equipment"), "_TBD_");
		assert.equal(getSection(sheet, "Notes"), "Owes the harbourmaster 12 gp.");
	});

	it("is system-agnostic about what goes on a sheet", () => {
		// Nothing here knows what a spell slot is.
		const investigator = createSheet({
			name: "Prof. Ashcombe",
			status: { HP: "11/11", Sanity: "58/58", Luck: 45 },
			sections: ["Occupation", "Skills", "Backstory"],
		});
		assert.deepEqual(Object.keys(status(investigator)), ["HP", "Sanity", "Luck"]);
		assert.ok(listSections(investigator).includes("Occupation"));
		assert.ok(!listSections(investigator).includes("Ability Scores"));
	});
});

describe("the two projections", () => {
	it("generates a Status list from frontmatter", () => {
		const body = getSection(brannoc(), "Status")!;
		assert.match(body, /^<!-- portent:generated status -->$/m);
		assert.match(body, /- \*\*HP:\*\* 22\/26/);
		assert.match(body, /- \*\*AC:\*\* 15/);
	});

	it("generates an Ability Scores table from frontmatter", () => {
		const body = getSection(brannoc(), "Ability Scores")!;
		assert.match(body, /\| Ability \| Value \|/);
		assert.match(body, /\| DEX \| 17 \(\+3\) \|/);
	});

	it("marks generated sections so a human knows not to edit them", () => {
		const sheet = brannoc();
		assert.equal(isGeneratedSection(sheet, "Status"), true);
		assert.equal(isGeneratedSection(sheet, "Ability Scores"), true);
		assert.equal(isGeneratedSection(sheet, "Notes"), false);
	});

	it("omits a projection when its frontmatter key is absent", () => {
		const sheet = createSheet({ name: "Minimal" });
		assert.equal(getSection(sheet, "Status"), undefined);
		assert.deepEqual(listSections(sheet), []);
	});

	it("keeps frontmatter and prose in agreement", () => {
		assert.deepEqual(sheetProblems(brannoc()), []);
		assert.equal(isConsistent(brannoc()), true);
	});
});

describe("patchStatus", () => {
	it("subtracts damage from current/max", () => {
		const patched = patchStatus(brannoc(), { HP: "-7" });
		assert.equal(statusValue(patched, "HP"), "15/26");
	});

	it("caps healing at the maximum", () => {
		assert.equal(statusValue(patchStatus(brannoc(), { HP: "+99" }), "HP"), "26/26");
	});

	it("allows negatives, for death-save territory", () => {
		assert.equal(statusValue(patchStatus(brannoc(), { HP: "-30" }), "HP"), "-8/26");
	});

	it("adjusts a plain number", () => {
		assert.equal(statusValue(patchStatus(brannoc(), { AC: "+2" }), "AC"), 17);
	});

	it("replaces a non-numeric value", () => {
		assert.equal(statusValue(patchStatus(brannoc(), { Conditions: "poisoned" }), "Conditions"), "poisoned");
	});

	it("matches keys case-insensitively", () => {
		assert.equal(statusValue(patchStatus(brannoc(), { hp: "1/26" }), "HP"), "1/26");
	});

	it("preserves key order and appends new keys", () => {
		const patched = patchStatus(brannoc(), { Conditions: "prone", Concentration: "Hunter's Mark" });
		assert.deepEqual(Object.keys(status(patched)), ["Level", "HP", "AC", "Conditions", "Concentration"]);
	});

	it("removes a key with null", () => {
		assert.ok(!("Conditions" in status(patchStatus(brannoc(), { Conditions: null }))));
	});

	it("updates the prose at the same time", () => {
		// The whole point: the two cannot drift apart through the normal API.
		const patched = patchStatus(brannoc(), { HP: "-7" });
		assert.match(getSection(patched, "Status")!, /- \*\*HP:\*\* 15\/26/);
		assert.deepEqual(sheetProblems(patched), []);
	});

	it("leaves prose sections alone", () => {
		const patched = patchStatus(brannoc(), { HP: "-7" });
		assert.equal(getSection(patched, "Notes"), "Owes the harbourmaster 12 gp.");
	});

	it("does not mutate the sheet it was given", () => {
		const sheet = brannoc();
		patchStatus(sheet, { HP: "-7" });
		assert.equal(statusValue(sheet, "HP"), "22/26");
	});

	it("survives twenty patches", () => {
		let sheet = brannoc();
		for (let i = 0; i < 20; i++) sheet = patchStatus(sheet, { HP: i % 2 === 0 ? "-3" : "+1" });
		assert.deepEqual(sheetProblems(sheet), []);
		assert.equal(listSections(sheet).length, 4);
	});
});

describe("patchMap", () => {
	it("works on any nested key, not just status", () => {
		const patched = patchMap(brannoc(), "abilities", { DEX: "18 (+4)" });
		assert.match(getSection(patched, "Ability Scores")!, /\| DEX \| 18 \(\+4\) \|/);
	});

	it("creates the map if it is absent", () => {
		const sheet = patchMap(createSheet({ name: "X" }), "status", { HP: "5/5" });
		assert.equal(statusValue(sheet, "HP"), "5/5");
		assert.ok(getSection(sheet, "Status"));
	});
});

describe("drift between the two projections", () => {
	it("is reported, not silently resolved", () => {
		// Someone hand-edits the prose. The frontmatter is canonical, but guessing
		// which side they meant is how you lose a player's HP.
		const sheet = brannoc();
		const tampered = setSection(sheet, "Status", "<!-- portent:generated status -->\n\n- **HP:** 99/26");
		const problems = sheetProblems(tampered);
		assert.equal(problems.length, 1, problems.join("; "));
		assert.match(problems[0], /"Status" section disagrees with frontmatter "status"/);
		assert.match(problems[0], /frontmatter is canonical/);
		assert.equal(isConsistent(tampered), false);
	});

	it("is repaired by syncGeneratedSections, frontmatter winning", () => {
		const tampered = setSection(brannoc(), "Status", "<!-- portent:generated status -->\n\n- **HP:** 99/26");
		const repaired = syncGeneratedSections(tampered);
		assert.deepEqual(sheetProblems(repaired), []);
		assert.match(getSection(repaired, "Status")!, /22\/26/);
	});

	it("notices a generated section that lost its frontmatter", () => {
		const orphaned = setMeta(brannoc(), "status", null);
		assert.match(sheetProblems(orphaned)[0], /present but frontmatter has no "status"/);
	});

	it("notices frontmatter with no section", () => {
		const sheet = brannoc();
		const stripped: Sheet = {
			data: sheet.data,
			body: sheet.body.split("\n").filter((line) => !line.includes("HP") && !line.includes("Status")).join("\n"),
		};
		assert.ok(sheetProblems(stripped).some((p) => /"Status" section is missing/.test(p)));
	});

	it("warns when a hand-written section collides with a generated name", () => {
		const sheet = setSection(createSheet({ name: "X", status: { HP: "1/1" } }), "Status", "hand written");
		assert.match(sheetProblems(sheet)[0], /not marked as generated, so it will be overwritten/);
	});
});

describe("sections", () => {
	it("replaces a body", () => {
		assert.equal(getSection(setSection(brannoc(), "Notes", "New note."), "Notes"), "New note.");
	});

	it("appends a missing section", () => {
		const sheet = setSection(brannoc(), "Companions", "- Wolf: Ash");
		assert.equal(getSection(sheet, "Companions"), "- Wolf: Ash");
		assert.equal(listSections(sheet).length, 5);
	});

	it("appends to an existing section", () => {
		const sheet = appendToSection(brannoc(), "Notes", "Also owes the smith.");
		assert.equal(getSection(sheet, "Notes"), "Owes the harbourmaster 12 gp.\nAlso owes the smith.");
	});

	it("replaces a _TBD_ stub rather than appending to it", () => {
		assert.equal(getSection(appendToSection(brannoc(), "Equipment", "- Longbow"), "Equipment"), "- Longbow");
	});

	it("matches headings case-insensitively", () => {
		assert.equal(getSection(brannoc(), "notes"), "Owes the harbourmaster 12 gp.");
	});
});

describe("round trip through markdown", () => {
	it("survives a write and a read", () => {
		const sheet = brannoc();
		const parsed = parseSheet(stringifySheet(sheet));
		assert.deepEqual(parsed.data, sheet.data);
		assert.equal(parsed.body.trim(), sheet.body.trim());
		assert.deepEqual(sheetProblems(parsed), []);
	});

	it("is stable over repeated round trips", () => {
		let text = stringifySheet(brannoc());
		for (let i = 0; i < 5; i++) {
			const next = stringifySheet(parseSheet(text));
			assert.equal(next, text, `changed on pass ${i + 1}`);
			text = next;
		}
	});

	it("survives a patch, a write and a read", () => {
		const patched = patchStatus(brannoc(), { HP: "-7", Conditions: "poisoned" });
		const reread = parseSheet(stringifySheet(patched));
		assert.equal(statusValue(reread, "HP"), "15/26");
		assert.equal(statusValue(reread, "Conditions"), "poisoned");
		assert.deepEqual(sheetProblems(reread), []);
	});

	it("produces a file a person would be happy to read", () => {
		const text = stringifySheet(brannoc());
		assert.match(text, /^---\nname: Brannoc Thistlewood\n/);
		assert.match(text, /\n---\n\n# Brannoc Thistlewood\n/);
		assert.match(text, /_Level 3 Wood Elf Ranger \(Hunter\)_/);
		assert.match(text, /## Status\n/);
		assert.match(text, /- \*\*HP:\*\* 22\/26/);
		assert.ok(text.endsWith("\n"));
	});

	it("reads a sheet with no frontmatter without exploding", () => {
		const sheet = parseSheet("# Hand-written\n\n## Notes\n\nJust prose.\n");
		assert.deepEqual(sheet.data, {});
		assert.equal(getSection(sheet, "Notes"), "Just prose.");
		assert.match(sheetProblems(sheet)[0], /no name/);
	});
});

describe("applyDelta", () => {
	it("handles fractions, plain numbers and replacements", () => {
		assert.equal(applyDelta("22/26", "-7"), "15/26");
		assert.equal(applyDelta("22/26", "+10"), "26/26");
		assert.equal(applyDelta("4", "+1"), "5");
		assert.equal(applyDelta(4, "+1"), 5);
		assert.equal(applyDelta("none", "poisoned"), "poisoned");
		assert.equal(applyDelta(undefined, "12"), 12);
	});

	it("coerces a bare numeric string to a number", () => {
		assert.equal(applyDelta("5", "12"), 12);
		assert.equal(typeof applyDelta("5", "12"), "number");
	});
});

describe("statusDigest", () => {
	it("summarises the interesting keys", () => {
		assert.equal(statusDigest(brannoc(), ["HP", "AC"]), "HP 22/26 · AC 15");
	});

	it("defaults to the first few", () => {
		assert.equal(statusDigest(brannoc()), "Level 3 · HP 22/26 · AC 15 · Conditions none");
	});

	it("skips keys the sheet does not have", () => {
		assert.equal(statusDigest(brannoc(), ["HP", "Sanity"]), "HP 22/26");
	});

	it("is empty for a sheet with no status", () => {
		assert.equal(statusDigest(createSheet({ name: "X" })), "");
	});
});
