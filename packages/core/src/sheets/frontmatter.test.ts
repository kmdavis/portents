import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	emitFrontmatter,
	type Frontmatter,
	FrontmatterError,
	hasFrontmatter,
	parseDocument,
	stringifyDocument,
} from "./frontmatter.ts";

describe("parseDocument", () => {
	it("returns the whole text as body when there is no frontmatter", () => {
		const doc = parseDocument("# Just markdown\n\nHello.\n");
		assert.deepEqual(doc.data, {});
		assert.equal(doc.body, "# Just markdown\n\nHello.\n");
	});

	it("splits frontmatter from body", () => {
		const doc = parseDocument("---\nname: Brannoc\n---\n\n# Brannoc\n\nA ranger.\n");
		assert.deepEqual(doc.data, { name: "Brannoc" });
		assert.equal(doc.body, "# Brannoc\n\nA ranger.\n");
	});

	it("reads numbers, booleans and strings", () => {
		const doc = parseDocument("---\nlevel: 3\nweight: 1.5\ndead: false\nname: Brannoc\n---\n");
		assert.deepEqual(doc.data, { level: 3, weight: 1.5, dead: false, name: "Brannoc" });
	});

	it("keeps a quoted number as a string", () => {
		// Editions are "2024", not 2024.
		assert.deepEqual(parseDocument('---\nedition: "2024"\n---\n').data, { edition: "2024" });
		assert.deepEqual(parseDocument('---\nyes: "true"\n---\n').data, { yes: "true" });
	});

	it("keeps values that only look numeric as strings", () => {
		assert.deepEqual(parseDocument("---\nhp: 22/26\ndamage: 1d8+3\n---\n").data, {
			hp: "22/26",
			damage: "1d8+3",
		});
	});

	it("reads an inline list", () => {
		assert.deepEqual(parseDocument("---\nconditions: [poisoned, prone]\n---\n").data, {
			conditions: ["poisoned", "prone"],
		});
		assert.deepEqual(parseDocument("---\nconditions: []\n---\n").data, { conditions: [] });
	});

	it("reads a block list", () => {
		assert.deepEqual(parseDocument("---\nlanguages:\n  - Common\n  - Elvish\n---\n").data, {
			languages: ["Common", "Elvish"],
		});
	});

	it("reads one level of nesting", () => {
		assert.deepEqual(parseDocument("---\nstatus:\n  hp: 22/26\n  ac: 15\n---\n").data, {
			status: { hp: "22/26", ac: 15 },
		});
	});

	it("reads a bare key as an empty map", () => {
		assert.deepEqual(parseDocument("---\nstatus:\n---\n").data, { status: {} });
	});

	it("keeps several blocks apart", () => {
		const doc = parseDocument("---\nname: X\nstatus:\n  hp: 5\nabilities:\n  str: 12\nlevel: 2\n---\n");
		assert.deepEqual(doc.data, { name: "X", status: { hp: 5 }, abilities: { str: 12 }, level: 2 });
	});

	it("ignores blank lines and whole-line comments", () => {
		const doc = parseDocument("---\n# a comment\nname: X\n\n# another\nlevel: 1\n---\n");
		assert.deepEqual(doc.data, { name: "X", level: 1 });
	});

	it("treats a # inside a value as text, not a comment", () => {
		// "Longbow +7, 1d8+4 # 150 ft" is a thing someone will write.
		assert.deepEqual(parseDocument("---\nattack: Longbow +7 # 150 ft\n---\n").data, {
			attack: "Longbow +7 # 150 ft",
		});
	});
});

describe("what parseDocument refuses", () => {
	const cases: Array<[label: string, text: string, pattern: RegExp]> = [
		["carriage returns", "---\r\nname: X\r\n---\r\n", /Unix line endings/],
		["an unterminated fence", "---\nname: X\n", /no matching closing/],
		["a tab indent", "---\nstatus:\n\thp: 5\n---\n", /tabs are not allowed/],
		["deeper nesting", "---\na:\n  b:\n    c: 1\n---\n", /deeper than one level/],
		["a list of maps", "---\na:\n  - b: 1\n---\n", /lists of maps are not supported/],
		["an inline map", "---\na: { b: 1 }\n---\n", /inline maps are not supported/],
		["an anchor", "---\na: &anchor x\n---\n", /anchors and aliases/],
		["an alias", "---\na: *anchor\n---\n", /anchors and aliases/],
		["a block scalar", "---\na: |\n  text\n---\n", /block scalars/],
		["a folded scalar", "---\na: >\n  text\n---\n", /block scalars/],
		["null", "---\na: null\n---\n", /null is not supported/],
		["a duplicate key", "---\na: 1\na: 2\n---\n", /duplicate key "a"/],
		["a line that is not a pair", "---\njust some words\n---\n", /expected "key: value"/],
		["an unclosed inline list", "---\na: [1, 2\n---\n", /unclosed inline list/],
		["a list with no key", "---\n  - orphan\n---\n", /list item with no key/],
		["a nested list", "---\na: [[1]]\n---\n", /nested lists and maps/],
		["inconsistent list indent", "---\na:\n  - 1\n    - 2\n---\n", /inconsistent indentation|expected "key: value"/],
	];

	for (const [label, text, pattern] of cases) {
		it(`rejects ${label}`, () => {
			assert.throws(() => parseDocument(text), FrontmatterError, `${label} was accepted`);
			assert.throws(() => parseDocument(text), pattern);
		});
	}

	it("names the line", () => {
		try {
			parseDocument("---\nname: X\nlevel: null\n---\n");
			assert.fail("should have thrown");
		} catch (error) {
			assert.equal((error as FrontmatterError).line, 3);
			assert.match((error as Error).message, /line 3/);
		}
	});
});

describe("emitFrontmatter", () => {
	it("writes scalars", () => {
		assert.equal(emitFrontmatter({ name: "Brannoc", level: 3, dead: false }), "name: Brannoc\nlevel: 3\ndead: false");
	});

	it("quotes anything that would come back as the wrong type", () => {
		assert.equal(emitFrontmatter({ edition: "2024" }), 'edition: "2024"');
		assert.equal(emitFrontmatter({ yes: "true" }), 'yes: "true"');
		assert.equal(emitFrontmatter({ empty: "" }), 'empty: ""');
	});

	it("quotes anything structurally ambiguous", () => {
		assert.match(emitFrontmatter({ a: "- dash" }), /^a: "- dash"$/);
		assert.match(emitFrontmatter({ a: "key: value" }), /^a: "key: value"$/);
		assert.match(emitFrontmatter({ a: " padded " }), /^a: " padded "$/);
	});

	it("writes lists and maps", () => {
		assert.equal(emitFrontmatter({ tags: ["a", "b"] }), "tags:\n  - a\n  - b");
		assert.equal(emitFrontmatter({ tags: [] }), "tags: []");
		assert.equal(emitFrontmatter({ status: { hp: "5/5" } }), "status:\n  hp: 5/5");
		assert.equal(emitFrontmatter({ status: {} }), "status:");
	});

	it("preserves key order", () => {
		assert.equal(emitFrontmatter({ z: 1, a: 2, m: 3 }), "z: 1\na: 2\nm: 3");
	});

	it("allows a key with spaces, which a sheet needs", () => {
		assert.equal(emitFrontmatter({ "Temp HP": 0 }), "Temp HP: 0");
	});

	it("refuses an unwritable key or value", () => {
		assert.throws(() => emitFrontmatter({ "bad:key": 1 }), /invalid key/);
		assert.throws(() => emitFrontmatter({ a: "two\nlines" }), /multi-line value/);
		assert.throws(() => emitFrontmatter({ a: Number.NaN }), /non-finite/);
	});
});

describe("round trip", () => {
	const corpus: Frontmatter[] = [
		{},
		{ name: "Brannoc Thistlewood" },
		{ level: 3, hp: "22/26", ac: 15, dead: false },
		{ edition: "2024", system: "5e" },
		{ conditions: [] },
		{ conditions: ["poisoned", "prone"] },
		{ status: {} },
		{ status: { hp: "22/26", ac: 15, conditions: "none" } },
		{ name: "X", status: { hp: 1 }, abilities: { str: 12, dex: 17 }, languages: ["Common"] },
		// Values chosen to break a naive emitter.
		{ tricky: "true", alsoTricky: "3", empty: "", padded: " x ", colon: "a: b", dash: "- x" },
		{ dice: "1d8+3", fraction: "22/26", math: "floor((2d6+3)/2)" },
		{ hash: "Longbow +7 # 150 ft" },
		{ quote: 'she said "no"' },
		{ backslash: "a\\b" },
		{ bracket: "[not a list]", brace: "{not a map}" },
		{ negative: -5, decimal: 1.5, zero: 0 },
		{ unicode: "café · dwarf ᚦ · 🎲" },
	];

	for (const [index, data] of corpus.entries()) {
		it(`survives case ${index}: ${JSON.stringify(data).slice(0, 60)}`, () => {
			const text = stringifyDocument({ data, body: "# Body\n" });
			const parsed = parseDocument(text);
			assert.deepEqual(parsed.data, data, `\n--- emitted ---\n${text}`);
			assert.equal(parsed.body, "# Body\n");
		});
	}

	it("is stable over repeated round trips", () => {
		let text = stringifyDocument({ data: corpus[9], body: "# Body\n" });
		for (let i = 0; i < 5; i++) {
			const parsed = parseDocument(text);
			const next = stringifyDocument(parsed);
			assert.equal(next, text, `changed on pass ${i + 1}`);
			text = next;
		}
	});

	it("emits something a YAML reader would recognise", () => {
		// Not a YAML parser, but what it writes should be valid YAML so other
		// tools can read a sheet.
		const text = stringifyDocument({ data: corpus[8], body: "" });
		assert.match(text, /^---\n/);
		assert.match(text, /\n---\n/);
		assert.ok(!text.includes("\t"));
		for (const line of text.split("\n").slice(1)) {
			if (line === "---" || line === "") break;
			assert.match(line, /^(\s{2}- |\s{2}[A-Za-z_]|[A-Za-z_])/, `suspicious line: ${JSON.stringify(line)}`);
		}
	});
});

describe("stringifyDocument", () => {
	it("omits the fence when there is no data", () => {
		assert.equal(stringifyDocument({ data: {}, body: "# Hello\n" }), "# Hello\n");
	});

	it("always ends with a newline", () => {
		assert.ok(stringifyDocument({ data: { a: 1 }, body: "x" }).endsWith("\n"));
		assert.ok(stringifyDocument({ data: {}, body: "x" }).endsWith("\n"));
	});

	it("puts one blank line between the fence and the body", () => {
		assert.equal(stringifyDocument({ data: { a: 1 }, body: "# H\n" }), "---\na: 1\n---\n\n# H\n");
	});
});

describe("hasFrontmatter", () => {
	it("detects a leading fence only", () => {
		assert.equal(hasFrontmatter("---\na: 1\n---\n"), true);
		assert.equal(hasFrontmatter("# Heading\n\n---\n"), false);
		assert.equal(hasFrontmatter(""), false);
	});
});

describe("a colon inside a list item", () => {
	it("is rejected unquoted, because YAML would call it a map", () => {
		assert.throws(() => parseDocument("---\ngear:\n  - Longbow: +7\n---\n"), /lists of maps are not supported/);
	});

	it("is accepted when quoted", () => {
		assert.deepEqual(parseDocument('---\ngear:\n  - "Longbow: +7"\n---\n').data, { gear: ["Longbow: +7"] });
	});

	it("round-trips once quoted", () => {
		const data = { gear: ["Longbow: +7, 150 ft"] };
		assert.deepEqual(parseDocument(stringifyDocument({ data, body: "" })).data, data);
	});
});

describe("keys with spaces", () => {
	// A character sheet needs "Temp HP" and "Hit Dice". An earlier version emitted
	// those happily and then could not read the file back.
	it("parses a spaced key at the top level and nested", () => {
		const doc = parseDocument("---\nCharacter Name: Brannoc\nstatus:\n  Temp HP: 0\n  Hit Dice: 3d10\n---\n");
		assert.deepEqual(doc.data, {
			"Character Name": "Brannoc",
			status: { "Temp HP": 0, "Hit Dice": "3d10" },
		});
	});

	it("round-trips the status keys a real sheet uses", () => {
		const data = {
			status: {
				Level: 3,
				XP: 900,
				HP: "19/26",
				"Temp HP": 0,
				AC: 15,
				Speed: "35 ft",
				Conditions: "poisoned",
				"Hit Dice": "3d10",
				Inspiration: false,
				"Spell Slots": "2",
				"Death Saves": "0 successes / 0 failures",
				Gold: "42 gp",
			},
		};
		const parsed = parseDocument(stringifyDocument({ data, body: "" }));
		assert.deepEqual(parsed.data, data);
	});

	it("keeps a colon in a value out of the key", () => {
		assert.deepEqual(parseDocument("---\nattack: Longbow: +7\n---\n").data, { attack: "Longbow: +7" });
	});

	it("refuses a key that could not be read back", () => {
		assert.throws(() => emitFrontmatter({ "bad:key": 1 }), /invalid key/);
		assert.throws(() => emitFrontmatter({ " padded": 1 }), /invalid key/);
		assert.throws(() => emitFrontmatter({ "trailing ": 1 }), /invalid key/);
		assert.throws(() => emitFrontmatter({ "1numeric": 1 }), /invalid key/);
	});

	it("refuses a nested key that could not be read back", () => {
		assert.throws(() => emitFrontmatter({ status: { "bad:key": 1 } }), /invalid nested key under "status"/);
	});
});
