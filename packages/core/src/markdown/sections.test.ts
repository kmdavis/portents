import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	appendToSectionBody,
	hasSection,
	lastSections,
	removeSection,
	sectionBody,
	sectionHeadings,
	sections,
	setSectionBody,
} from "./sections.ts";

const DOC = `# Brannoc

_A ranger._

## Equipment

- Longbow
- Rations

## Notes

Owes the harbourmaster.
`;

describe("finding sections", () => {
	it("lists headings in document order", () => {
		assert.deepEqual(sectionHeadings(DOC), ["Equipment", "Notes"]);
	});

	it("reads a body without its heading", () => {
		assert.equal(sectionBody(DOC, "Equipment"), "- Longbow\n- Rations");
	});

	it("matches case-insensitively, so a hand-typed heading is not duplicated", () => {
		assert.equal(sectionBody(DOC, "notes"), "Owes the harbourmaster.");
		assert.ok(hasSection(DOC, "EQUIPMENT"));
	});

	it("reports an absent section as undefined rather than empty", () => {
		assert.equal(sectionBody(DOC, "Spells"), undefined);
		assert.equal(hasSection(DOC, "Spells"), false);
	});

	it("ignores the h1 and any text before the first section", () => {
		assert.equal(sections(DOC).length, 2);
	});

	it("finds nothing in a document with no sections", () => {
		assert.deepEqual(sectionHeadings("# Title\n\nJust prose.\n"), []);
		assert.equal(lastSections("# Title\n", 3), "");
	});

	it("treats a ### subheading as part of its parent section", () => {
		// The whole trick that lets a user keep their own structure inside a
		// section the tools rewrite around.
		const text = "## Features\n\n### Level 1\n\nFavoured Enemy\n\n## Notes\n\nx\n";
		assert.equal(sectionBody(text, "Features"), "### Level 1\n\nFavoured Enemy");
		assert.deepEqual(sectionHeadings(text), ["Features", "Notes"]);
	});

	it("does not mistake a #### or a # for a section", () => {
		assert.deepEqual(sectionHeadings("# One\n#### Four\n## Two\n"), ["Two"]);
	});
});

describe("setting a body", () => {
	it("replaces one section and leaves the rest byte for byte", () => {
		const next = setSectionBody(DOC, "Equipment", "- Shortsword");
		assert.equal(sectionBody(next, "Equipment"), "- Shortsword");
		assert.equal(sectionBody(next, "Notes"), "Owes the harbourmaster.");
		assert.match(next, /^# Brannoc\n\n_A ranger\._/);
	});

	it("appends a section that does not exist yet", () => {
		const next = setSectionBody(DOC, "Spells", "- Hunter's Mark");
		assert.deepEqual(sectionHeadings(next), ["Equipment", "Notes", "Spells"]);
	});

	it("appends into an empty document without a leading blank line", () => {
		assert.equal(setSectionBody("", "Notes", "x"), "## Notes\n\nx\n");
	});

	it("keeps the heading's own capitalisation when replacing", () => {
		const next = setSectionBody(DOC, "notes", "Changed.");
		assert.match(next, /## Notes/, "the original heading text should survive");
		assert.doesNotMatch(next, /## notes/);
	});

	it("does not accumulate blank lines over repeated writes", () => {
		let text = DOC;
		for (let i = 0; i < 10; i++) text = setSectionBody(text, "Notes", `pass ${i}`);
		assert.doesNotMatch(text, /\n\n\n/);
		assert.equal(sectionHeadings(text).length, 2);
	});

	it("always ends with exactly one newline", () => {
		for (const body of ["x", "x\n", "x\n\n\n"]) {
			const next = setSectionBody(DOC, "Notes", body);
			assert.ok(next.endsWith("\n"));
			assert.ok(!next.endsWith("\n\n"));
		}
	});

	it("does not turn a mid-line ## into a heading", () => {
		const next = setSectionBody(DOC, "Notes", "The sign read: ## Closed");
		assert.equal(sectionBody(next, "Notes"), "The sign read: ## Closed");
		assert.deepEqual(sectionHeadings(next), ["Equipment", "Notes"], "prose was promoted to a heading");
	});

	it("does let a body that starts a line with ## become a real section", () => {
		// A markdown fact rather than a bug: that text genuinely is a heading, and
		// pretending otherwise would mean escaping the user's own content.
		const next = setSectionBody(DOC, "Notes", "## Closed\n\nThe shop is shut.");
		assert.ok(sectionHeadings(next).includes("Closed"));
	});
});

describe("appending to a body", () => {
	it("adds to what is there", () => {
		assert.equal(
			sectionBody(appendToSectionBody(DOC, "Notes", "Also owes the smith."), "Notes"),
			"Owes the harbourmaster.\nAlso owes the smith.",
		);
	});

	it("replaces a _TBD_ stub rather than appending below it", () => {
		const stub = "## Notes\n\n_TBD_\n";
		assert.equal(sectionBody(appendToSectionBody(stub, "Notes", "Real note."), "Notes"), "Real note.");
	});

	it("replaces an empty body rather than adding a blank line", () => {
		assert.equal(sectionBody(appendToSectionBody("## Notes\n\n", "Notes", "x"), "Notes"), "x");
	});

	it("creates the section when absent", () => {
		assert.equal(sectionBody(appendToSectionBody(DOC, "Spells", "x"), "Spells"), "x");
	});
});

describe("removing a section", () => {
	it("takes the heading and its body", () => {
		const next = removeSection(DOC, "Equipment");
		assert.deepEqual(sectionHeadings(next), ["Notes"]);
		assert.doesNotMatch(next, /Longbow/);
	});

	it("leaves the document alone when the heading is absent", () => {
		assert.equal(removeSection(DOC, "Spells"), DOC);
	});

	it("keeps the preamble", () => {
		assert.match(removeSection(DOC, "Equipment"), /^# Brannoc/);
	});
});

describe("the recent tail", () => {
	const journal = ["# Journal", "", "## One", "", "a", "", "## Two", "", "b", "", "## Three", "", "c", ""].join("\n");

	it("returns the last sections with their headings, newest last", () => {
		const tail = lastSections(journal, 2);
		assert.match(tail, /^## Two/);
		assert.match(tail, /## Three/);
		assert.doesNotMatch(tail, /## One/);
	});

	it("returns everything when asked for more than exists", () => {
		assert.equal(sectionHeadings(lastSections(journal, 99)).length, 3);
	});

	it("returns nothing for a count of zero or less", () => {
		assert.equal(lastSections(journal, 0), "");
		assert.equal(lastSections(journal, -1), "");
	});
});
