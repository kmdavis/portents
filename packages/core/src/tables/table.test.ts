import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Deck } from "../decks/deck.ts";
import { createRegistry } from "../packs/registry.ts";
import { seededRandomSource } from "../ports/random.ts";
import { formatTableResult, rollTable, rollTableById, type Table, TableError, tableProblems, tableReferences } from "./table.ts";

const d6: Table = {
	id: "d6-table",
	name: "A d6 Table",
	dice: "1d6",
	provenance: { source: "test" },
	entries: [
		{ range: [1, 2], text: "low" },
		{ range: [3, 4], text: "middle" },
		{ range: [5, 6], text: "high" },
	],
};

const weighted: Table = {
	id: "weighted-table",
	name: "A Weighted Table",
	provenance: { source: "test" },
	entries: [
		{ weight: 9, text: "common" },
		{ weight: 1, text: "rare" },
	],
};

const names: Table = {
	id: "names",
	name: "Names",
	provenance: { source: "test" },
	entries: [{ text: "Borin" }],
};

const composed: Table = {
	id: "composed",
	name: "Composed",
	provenance: { source: "test" },
	entries: [
		{
			text: "{{table:names}} arrives with {{roll:2d6}} companions, heading {{pick:north|south}}, carrying {{deck:loot}}",
		},
	],
};

const loot: Deck = {
	id: "loot",
	name: "Loot",
	description: "test deck",
	provenance: { source: "test" },
	cards: [{ name: "a brass key" }],
};

const registry = createRegistry([{ id: "test", tables: [d6, weighted, names, composed], decks: [loot] }]);
const rng = () => seededRandomSource("table-test");

describe("dice-keyed tables", () => {
	it("selects by the roll and reports it", () => {
		const result = rollTable(d6, { rng: rng() });
		assert.ok(["low", "middle", "high"].includes(result.text));
		assert.equal(result.rolled?.expression, "1d6");
		assert.ok(result.rolled!.total >= 1 && result.rolled!.total <= 6);
	});

	it("maps the roll to the right range", () => {
		for (let i = 0; i < 200; i++) {
			const result = rollTable(d6);
			const total = result.rolled!.total;
			const expected = total <= 2 ? "low" : total <= 4 ? "middle" : "high";
			assert.equal(result.text, expected, `${total} gave ${result.text}`);
		}
	});

	it("reaches every entry", () => {
		const seen = new Set<string>();
		for (let i = 0; i < 200; i++) seen.add(rollTable(d6).text);
		assert.deepEqual([...seen].sort(), ["high", "low", "middle"]);
	});

	it("fails loudly on a roll its ranges do not cover", () => {
		const gappy: Table = { ...d6, entries: [{ range: [1, 2], text: "only low" }] };
		assert.throws(() => {
			for (let i = 0; i < 100; i++) rollTable(gappy);
		}, TableError);
		assert.throws(() => {
			for (let i = 0; i < 100; i++) rollTable(gappy);
		}, /run tableProblems on it/);
	});
});

describe("weighted tables", () => {
	it("has no roll to report", () => {
		assert.equal(rollTable(weighted, { rng: rng() }).rolled, undefined);
	});

	it("respects the weights", () => {
		let common = 0;
		for (let i = 0; i < 2000; i++) if (rollTable(weighted).text === "common") common++;
		// 9:1 should land near 90%; allow a wide band so this cannot flake.
		assert.ok(common > 1600 && common < 1960, `common came up ${common} times in 2000`);
	});

	it("treats a missing weight as 1", () => {
		const flat: Table = { ...weighted, entries: [{ text: "a" }, { text: "b" }] };
		let a = 0;
		for (let i = 0; i < 1000; i++) if (rollTable(flat).text === "a") a++;
		assert.ok(a > 400 && a < 600, `a came up ${a} times in 1000`);
	});

	it("rejects an empty table", () => {
		assert.throws(() => rollTable({ ...weighted, entries: [] }), /has no entries/);
	});
});

describe("composition", () => {
	it("resolves every kind of reference", () => {
		const result = rollTable(composed, { rng: rng(), registry });
		assert.match(result.text, /^Borin arrives with \d+ companions, heading (north|south), carrying a brass key$/);
	});

	it("records the trail", () => {
		const result = rollTable(composed, { rng: rng(), registry });
		assert.ok(result.nested.some((n) => n.startsWith("table names")));
		assert.ok(result.nested.some((n) => n.startsWith("roll 2d6 =")));
		assert.ok(result.nested.some((n) => n.startsWith("deck loot")));
	});

	it("resolves nested references recursively", () => {
		const deep = createRegistry([
			{
				id: "deep",
				tables: [
					{ id: "one", name: "One", provenance: { source: "t" }, entries: [{ text: "1{{table:two}}" }] },
					{ id: "two", name: "Two", provenance: { source: "t" }, entries: [{ text: "2{{table:three}}" }] },
					{ id: "three", name: "Three", provenance: { source: "t" }, entries: [{ text: "3" }] },
				],
			},
		]);
		assert.equal(rollTable(deep.requireTable("one"), { registry: deep }).text, "123");
	});

	it("stops at the depth limit rather than looping forever", () => {
		const cyclic = createRegistry([
			{
				id: "cyclic",
				tables: [{ id: "loop", name: "Loop", provenance: { source: "t" }, entries: [{ text: "x{{table:loop}}" }] }],
			},
		]);
		// One "x" comes from the entry's own text; maxDepth counts substitutions
		// after that, so three more. The unresolved reference is left visible.
		const result = rollTable(cyclic.requireTable("loop"), { registry: cyclic, maxDepth: 3 });
		assert.equal(result.text, "xxxx{{table:loop}}");

		const deeper = rollTable(cyclic.requireTable("loop"), { registry: cyclic, maxDepth: 5 });
		assert.equal(deeper.text, "xxxxxx{{table:loop}}");
	});

	it("terminates on a cycle at the default depth", () => {
		const cyclic = createRegistry([
			{
				id: "cyclic",
				tables: [
					{ id: "ping", name: "Ping", provenance: { source: "t" }, entries: [{ text: "{{table:pong}}" }] },
					{ id: "pong", name: "Pong", provenance: { source: "t" }, entries: [{ text: "{{table:ping}}" }] },
				],
			},
		]);
		// Mutual recursion must not hang the process.
		const result = rollTable(cyclic.requireTable("ping"), { registry: cyclic });
		assert.match(result.text, /\{\{table:(ping|pong)\}\}/);
	});

	it("makes a broken reference visible instead of dropping it", () => {
		// A GM reading "[table:nope failed]" knows to fix their pack. Silence would
		// just produce a sentence with a hole in it.
		const broken: Table = { ...names, id: "broken", entries: [{ text: "see {{table:nope}}" }] };
		const result = rollTable(broken, { registry });
		assert.match(result.text, /\[table:nope failed: Unknown table "nope"/);
		assert.match(result.text, /Available: composed, d6-table, names, weighted-table/);
	});

	it("reports a missing deck the same way", () => {
		const broken: Table = { ...names, id: "broken", entries: [{ text: "{{deck:nope}}" }] };
		assert.match(rollTable(broken, { registry }).text, /\[deck:nope failed: Unknown deck "nope"/);
	});

	it("explains an unusable pick", () => {
		const broken: Table = { ...names, id: "broken", entries: [{ text: "{{pick:only}}" }] };
		assert.match(rollTable(broken, { registry }).text, /pick needs at least two options/);
	});

	it("works with no registry when nothing is referenced", () => {
		assert.equal(rollTable(names).text, "Borin");
	});
});

describe("rollTableById", () => {
	it("looks the table up", () => {
		assert.equal(rollTableById("names", { registry }).text, "Borin");
	});

	it("lists what is available when the id is wrong", () => {
		assert.throws(() => rollTableById("nope", { registry }), /Unknown table "nope". Available: composed, d6-table/);
	});
});

describe("formatTableResult", () => {
	it("shows the dice for a keyed table", () => {
		assert.match(formatTableResult(rollTable(d6, { rng: rng() })), /^\*\*A d6 Table\*\* \(1d6 = \d\): /);
	});

	it("omits the dice for a weighted table", () => {
		assert.match(formatTableResult(rollTable(weighted, { rng: rng() })), /^\*\*A Weighted Table\*\*: /);
	});
});

describe("tableProblems", () => {
	it("passes well-formed tables", () => {
		assert.deepEqual(tableProblems(d6), []);
		assert.deepEqual(tableProblems(weighted), []);
	});

	it("catches a gap", () => {
		const gappy: Table = { ...d6, entries: [{ range: [1, 2], text: "a" }, { range: [4, 6], text: "b" }] };
		assert.ok(tableProblems(gappy).some((p) => /gap in ranges between 2 and 4/.test(p)));
	});

	it("catches an overlap", () => {
		const overlap: Table = { ...d6, entries: [{ range: [1, 4], text: "a" }, { range: [3, 6], text: "b" }] };
		assert.ok(tableProblems(overlap).some((p) => /ranges overlap between 4 and 3/.test(p)));
	});

	it("catches ranges that do not cover the dice", () => {
		const short: Table = { ...d6, entries: [{ range: [1, 4], text: "a" }] };
		assert.ok(tableProblems(short).some((p) => /ends at 4 but 1d6 can roll 6/.test(p)));
		const high: Table = { ...d6, entries: [{ range: [2, 6], text: "a" }] };
		assert.ok(tableProblems(high).some((p) => /starts at 2 but 1d6 can roll 1/.test(p)));
	});

	it("catches an inverted range", () => {
		const bad: Table = { ...d6, entries: [{ range: [6, 1], text: "a" }] };
		assert.ok(tableProblems(bad).some((p) => /is inverted/.test(p)));
	});

	it("catches a missing range on a keyed table", () => {
		const bad: Table = { ...d6, entries: [{ range: [1, 3], text: "a" }, { text: "b" }] };
		assert.ok(tableProblems(bad).some((p) => /no range on a dice-keyed table/.test(p)));
	});

	it("catches a range on a weighted table", () => {
		const bad: Table = { ...weighted, entries: [{ range: [1, 2], text: "a" }] };
		assert.ok(tableProblems(bad).some((p) => /has a range but the table is weighted/.test(p)));
	});

	it("catches a non-positive weight", () => {
		assert.ok(tableProblems({ ...weighted, entries: [{ weight: 0, text: "a" }] }).some((p) => /non-positive/.test(p)));
	});

	it("catches an unparseable dice expression", () => {
		assert.ok(tableProblems({ ...d6, dice: "banana" }).some((p) => /unparseable dice expression/.test(p)));
	});

	it("catches missing metadata and empty entries", () => {
		const problems = tableProblems({ id: "", name: "", entries: [] });
		assert.ok(problems.includes("has no id"));
		assert.ok(problems.includes("has no provenance.source"));
		assert.ok(problems.includes("has no entries"));
	});
});

describe("tableReferences", () => {
	it("lists every reference", () => {
		assert.deepEqual(tableReferences(composed), [
			{ kind: "table", id: "names" },
			{ kind: "roll", id: "2d6" },
			{ kind: "pick", id: "north|south" },
			{ kind: "deck", id: "loot" },
		]);
	});

	it("finds nothing in a plain table", () => {
		assert.deepEqual(tableReferences(names), []);
	});
});
