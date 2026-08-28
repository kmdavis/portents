import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { genericSheet, matchSheet, normaliseSystem, type SheetTemplate, templateProblems } from "./template.ts";

const dnd: SheetTemplate = {
	id: "dnd-5e",
	name: "Fifth-edition character",
	aliases: ["dnd 5e", "d&d 5e", "5e"],
	sections: ["Attacks & Spellcasting", "Equipment"],
};
const dnd2024: SheetTemplate = {
	id: "dnd-5e-2024",
	name: "Fifth-edition, 2024 printing",
	aliases: ["dnd 5e 2024", "5e 2024"],
	sections: ["Attacks & Spellcasting", "Equipment", "Weapon Mastery"],
};
const generic: SheetTemplate = {
	id: "generic",
	name: "Generic",
	generic: true,
	aliases: [],
	sections: ["Concept", "Notes"],
};

describe("normalising a system line", () => {
	it("ignores the punctuation people vary on", () => {
		assert.equal(normaliseSystem("D&D 5E"), "dnd 5e");
		assert.equal(normaliseSystem("5e (2024)"), "5e 2024");
		assert.equal(normaliseSystem("  Pathfinder_2E  "), "pathfinder 2e");
		assert.equal(normaliseSystem("Call of Cthulhu 7e"), "call of cthulhu 7e");
	});

	it("collapses runs of whitespace", () => {
		assert.equal(normaliseSystem("5e   (  2024 )"), "5e 2024");
	});
});

describe("matching a template", () => {
	const all = [generic, dnd, dnd2024];

	it("matches an exact alias", () => {
		assert.equal(matchSheet(all, "dnd 5e")?.id, "dnd-5e");
	});

	it("matches through punctuation differences", () => {
		assert.equal(matchSheet(all, "D&D 5E")?.id, "dnd-5e");
	});

	it("prefers a printing-specific template over the system one", () => {
		assert.equal(matchSheet(all, "5e (2024)")?.id, "dnd-5e-2024");
	});

	it("falls back to the system template for an unclaimed printing", () => {
		// Nobody wrote a 2014 template, so the 5e one is right rather than nothing.
		assert.equal(matchSheet(all, "5e (2014)")?.id, "dnd-5e");
	});

	it("returns nothing for a system nobody claimed", () => {
		// The important one. A guess here is written to a file the player keeps.
		assert.equal(matchSheet(all, "Call of Cthulhu 7e"), undefined);
		assert.equal(matchSheet(all, "Blades in the Dark"), undefined);
	});

	it("never returns the generic template implicitly", () => {
		// The caller must choose the fallback, so it can tell the player it is
		// falling back. Tested with a generic template that *does* claim aliases --
		// invalid per templateProblems, but the only shape that exercises the guard.
		// With aliases empty the assertion passed even with the guard deleted.
		const greedyGeneric: SheetTemplate = { ...generic, aliases: ["anything", "5e"] };
		assert.equal(matchSheet([greedyGeneric], "anything"), undefined);
		assert.equal(matchSheet([greedyGeneric, dnd], "5e")?.id, "dnd-5e", "generic won over a real template");
		assert.equal(genericSheet([generic])?.id, "generic");
	});

	it("does not match on similarity", () => {
		assert.equal(matchSheet(all, "5th edition"), undefined);
		assert.equal(matchSheet(all, "dnd"), undefined);
	});

	it("returns nothing for an empty system", () => {
		assert.equal(matchSheet(all, "   "), undefined);
	});
});

describe("template problems", () => {
	it("passes a well-formed template", () => {
		assert.deepEqual(templateProblems(dnd), []);
		assert.deepEqual(templateProblems(generic), []);
	});

	it("catches a template nothing can match", () => {
		assert.match(templateProblems({ ...dnd, aliases: [] })[0], /claims no systems/);
	});

	it("catches a template that is both generic and system-specific", () => {
		assert.match(templateProblems({ ...dnd, generic: true })[0], /can only be one/);
	});

	it("catches a section that the tools generate anyway", () => {
		// Declaring Status would have it silently overwritten from frontmatter.
		for (const heading of ["Status", "Ability Scores", "status"]) {
			assert.match(
				templateProblems({ ...dnd, sections: [heading] })[0],
				/generated from frontmatter and would be overwritten/,
				heading,
			);
		}
	});

	it("catches a repeated section", () => {
		assert.match(templateProblems({ ...dnd, sections: ["Notes", "notes"] })[0], /repeats the section/);
	});

	it("catches an empty template", () => {
		assert.match(templateProblems({ ...dnd, sections: [] })[0], /has no sections/);
	});
});
