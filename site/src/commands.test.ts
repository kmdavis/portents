/**
 * Slash commands and citation checking.
 *
 * Both come from one session that went wrong in two ways at once: `/roll 1d20` was not
 * implemented so it reached the model as text, and the model then reported a result
 * citing `r-18` -- a genuine ledger id from an earlier session, attached to a roll that
 * never happened.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkCitations, describeCitations, parseCommand } from "./commands.ts";

describe("parsing commands", () => {
	it("recognises a roll and keeps the whole expression", () => {
		assert.deepEqual(parseCommand("/roll 2d20kh1+5"), { kind: "roll", expression: "2d20kh1+5" });
		assert.deepEqual(parseCommand("/r 6#4d6kh3"), { kind: "roll", expression: "6#4d6kh3" });
	});

	it("reports a roll with no dice rather than guessing one", () => {
		const command = parseCommand("/roll");
		assert.equal(command?.kind, "unknown");
	});

	it("recognises the others, including short forms", () => {
		assert.equal(parseCommand("/ledger")?.kind, "ledger");
		assert.equal(parseCommand("/status")?.kind, "status");
		assert.equal(parseCommand("/brief")?.kind, "status");
		assert.equal(parseCommand("/help")?.kind, "help");
	});

	it("reports an unknown command by name", () => {
		assert.deepEqual(parseCommand("/teleport"), { kind: "unknown", name: "teleport" });
	});

	it("treats ordinary speech as speech", () => {
		for (const text of ["I open the door", "", "  ", "/"]) {
			assert.equal(parseCommand(text), undefined, `${JSON.stringify(text)} was taken as a command`);
		}
	});

	it("does not take a slash inside prose as a command", () => {
		// Players write "Paladin 1 / Warlock 2" constantly. Treating that as a command
		// would eat the message.
		assert.equal(parseCommand("Ossiran is Paladin 1 / Hexblade Warlock 2"), undefined);
		assert.equal(parseCommand("go left/right?"), undefined);
	});

	it("ignores case and surrounding space", () => {
		assert.deepEqual(parseCommand("  /ROLL 1d20  "), { kind: "roll", expression: "1d20" });
	});
});

describe("checking cited ids", () => {
	it("accepts ids produced this turn", () => {
		const problems = checkCitations("19 to hit r-4, and 13 damage r-5.", {
			thisTurn: ["r-4", "r-5"],
			known: ["r-1", "r-4", "r-5"],
		});
		assert.deepEqual(problems, []);
	});

	it("flags an id that is in no ledger entry", () => {
		// Invented outright.
		const problems = checkCitations("Ossiran's check is 9 (r-99).", { thisTurn: [], known: ["r-1"] });
		assert.deepEqual(problems, [{ id: "r-99", kind: "unknown" }]);
	});

	it("flags a real id that was not rolled this turn", () => {
		// The actual failure: r-18 existed, from an earlier session, and was reattached
		// to a new claim.
		const problems = checkCitations("Ossiran's Arcana check is 9, failing by 4 (r-18).", {
			thisTurn: [],
			known: ["r-17", "r-18"],
		});
		assert.deepEqual(problems, [{ id: "r-18", kind: "stale" }]);
	});

	it("reports each id once however often it is cited", () => {
		const problems = checkCitations("r-18 and again r-18 and r-18", { thisTurn: [], known: ["r-18"] });
		assert.equal(problems.length, 1);
	});

	it("recognises every ledger prefix and the writer suffix", () => {
		const problems = checkCitations("h-1 d-2 o-3 c-4 r-5b", { thisTurn: [], known: [] });
		assert.deepEqual(problems.map((problem) => problem.id), ["h-1", "d-2", "o-3", "c-4", "r-5b"]);
	});

	it("does not mistake ordinary prose for a citation", () => {
		// Hyphenated words and dice expressions must not look like ids.
		const problems = checkCitations("The half-orc rolled 2d20kh1 and took 3-4 damage on a d-day.", {
			thisTurn: [],
			known: [],
		});
		assert.deepEqual(problems.map((problem) => problem.id), []);
	});
});

describe("describing the problem", () => {
	it("says plainly that an unknown id was not rolled", () => {
		const text = describeCitations([{ id: "r-99", kind: "unknown" }]);
		assert.match(text, /r-99/);
		assert.match(text, /not in the ledger/);
	});

	it("distinguishes stale from invented", () => {
		const text = describeCitations([{ id: "r-18", kind: "stale" }]);
		assert.match(text, /not rolled this turn/);
		assert.doesNotMatch(text, /not in the ledger/);
	});

	it("says nothing when there is nothing wrong", () => {
		assert.equal(describeCitations([]), "");
	});
});
