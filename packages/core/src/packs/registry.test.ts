import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	type ContentPack,
	createRegistry,
	DuplicateContentError,
	UnknownContentError,
	UnusedOverrideError,
} from "./registry.ts";

const table = (id: string, text: string) => ({
	id,
	name: id,
	dice: "1d1",
	entries: [{ min: 1, max: 1, text }],
});

const generic: ContentPack = {
	id: "generic",
	tables: [table("wild-magic", "generic surge"), table("traps", "a pit")],
	sheets: [{ id: "generic", name: "Generic", generic: true, aliases: [], sections: ["Concept"] }],
};

describe("declared overrides", () => {
	it("lets a system pack replace a generic entry it declared", () => {
		const system: ContentPack = {
			id: "dnd",
			tables: [table("wild-magic", "a sorcerous surge")],
			overrides: [{ kind: "table", id: "wild-magic", reason: "the system has its own" }],
		};
		const registry = createRegistry([generic, system]);
		assert.equal(registry.requireTable("wild-magic").entries[0].text, "a sorcerous surge");
		assert.equal(registry.requireTable("traps").entries[0].text, "a pit", "an unrelated entry changed");
	});

	it("refuses an undeclared collision, and says how to declare it", () => {
		// The property that made a blanket allowOverride flag wrong: two packs that
		// both define `traps` by accident must still be an error.
		const other: ContentPack = { id: "third-party", tables: [table("traps", "a snare")] };
		assert.throws(() => createRegistry([generic, other]), DuplicateContentError);
		assert.throws(() => createRegistry([generic, other]), /neither declares it as an override/);
		assert.throws(() => createRegistry([generic, other]), /add \{ kind: "table", id: "traps" \}/);
		assert.throws(() => createRegistry([generic, other]), /generic then third-party/);
	});

	it("refuses an override that matches nothing", () => {
		// A stale declaration means the pack is not replacing what it thinks.
		const stale: ContentPack = {
			id: "dnd",
			tables: [table("wild-magic", "x")],
			overrides: [{ kind: "table", id: "wlid-magic" }],
		};
		assert.throws(() => createRegistry([generic, stale]), UnusedOverrideError);
		assert.throws(() => createRegistry([generic, stale]), /nothing earlier defines it/);
	});

	it("refuses an override applied before its target loads", () => {
		const system: ContentPack = {
			id: "dnd",
			tables: [table("wild-magic", "x")],
			overrides: [{ kind: "table", id: "wild-magic" }],
		};
		// Order reversed: the override cannot fire, which is worth reporting because
		// the user would otherwise silently get the generic entry.
		assert.throws(() => createRegistry([system, generic]), UnusedOverrideError);
	});

	it("can be told not to police stale declarations", () => {
		const stale: ContentPack = { id: "x", tables: [table("a", "a")], overrides: [{ kind: "table", id: "nope" }] };
		assert.doesNotThrow(() => createRegistry([stale], { strictOverrides: false }));
	});

	it("reports what actually replaced what", () => {
		const system: ContentPack = {
			id: "dnd",
			tables: [table("wild-magic", "x")],
			overrides: [{ kind: "table", id: "wild-magic", reason: "system-specific" }],
		};
		const applied = createRegistry([generic, system]).appliedOverrides();
		assert.deepEqual(applied, [
			{ kind: "table", id: "wild-magic", reason: "system-specific", by: "dnd", replaced: "generic" },
		]);
	});

	it("still allows the blunt flag for a scratch pack", () => {
		const other: ContentPack = { id: "scratch", tables: [table("traps", "a snare")] };
		const registry = createRegistry([generic, other], { allowOverride: true });
		assert.equal(registry.requireTable("traps").entries[0].text, "a snare");
	});

	it("reports nothing when no override fired", () => {
		assert.deepEqual(createRegistry([generic]).appliedOverrides(), []);
	});
});

describe("sheet templates in the registry", () => {
	const system: ContentPack = {
		id: "dnd",
		sheets: [{ id: "dnd-5e", name: "5E", aliases: ["dnd 5e", "5e"], sections: ["Equipment"] }],
	};

	it("finds a template by the campaign's system line", () => {
		const registry = createRegistry([generic, system]);
		assert.equal(registry.sheetFor("5e (2024)")?.id, "dnd-5e");
		assert.equal(registry.sheetFor("D&D 5E")?.id, "dnd-5e");
	});

	it("returns nothing for a system nobody claimed", () => {
		assert.equal(createRegistry([generic, system]).sheetFor("Call of Cthulhu 7e"), undefined);
	});

	it("lists template ids", () => {
		assert.deepEqual(createRegistry([generic, system]).sheetIds(), ["dnd-5e", "generic"]);
	});

	it("treats a template collision like any other", () => {
		const clash: ContentPack = {
			id: "other",
			sheets: [{ id: "dnd-5e", name: "Mine", aliases: ["x"], sections: ["A"] }],
		};
		assert.throws(() => createRegistry([system, clash]), DuplicateContentError);
	});
});

describe("lookup errors", () => {
	it("lists what is available", () => {
		const registry = createRegistry([generic]);
		assert.throws(() => registry.requireTable("nope"), UnknownContentError);
		assert.throws(() => registry.requireTable("nope"), /Available: traps, wild-magic/);
	});
});
