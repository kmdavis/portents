import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	type ContentPack,
	createRegistry,
	DanglingContentReferenceError,
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

describe("settings and resources in the registry", () => {
	const setting = { schemaVersion: 1 as const, id: "portents/greywater", name: "Greywater", summary: "A river province." };
	const shrine = {
		schemaVersion: 1 as const,
		id: "portents/greywater/place/shrine",
		settingId: setting.id,
		kind: "place",
		name: "The Shrine",
		body: "Old stones beside the river.",
	};
	const pack: ContentPack = {
		id: "greywater-pack",
		settings: [setting],
		resources: [shrine],
		imageMaps: [{
			schemaVersion: 1,
			id: "portents/greywater/map/region",
			settingId: setting.id,
			name: "Greywater",
			scope: "region",
			asset: { key: "maps/region.webp", mimeType: "image/webp", width: 800, height: 500, alt: "Greywater region" },
			pins: [{ id: "shrine", x: 0.2, y: 0.8, label: "Shrine", resourceId: shrine.id }],
		}],
	};

	it("looks up each setting content kind and its owner", () => {
		const registry = createRegistry([pack]);
		assert.equal(registry.requireSetting(setting.id).name, "Greywater");
		assert.equal(registry.requireResource(shrine.id).body, "Old stones beside the river.");
		assert.equal(registry.requireImageMap("portents/greywater/map/region").pins?.[0].label, "Shrine");
		assert.equal(registry.ownerOf("image-map", "portents/greywater/map/region"), "greywater-pack");
	});

	it("groups resources and maps by setting in stable id order", () => {
		const another = { ...shrine, id: "portents/greywater/npc/nesta", kind: "npc", name: "Nesta", links: [shrine.id] };
		const registry = createRegistry([{ ...pack, resources: [shrine, another] }]);
		assert.deepEqual(registry.resourcesForSetting(setting.id).map((resource) => resource.id), [another.id, shrine.id]);
		assert.deepEqual(registry.imageMapsForSetting(setting.id).map((map) => map.id), ["portents/greywater/map/region"]);
	});

	it("rejects a resource whose setting is not loaded", () => {
		assert.throws(
			() => createRegistry([{ id: "fragment", resources: [{ ...shrine, settingId: "missing/setting", id: "missing/setting/place/shrine" }] }]),
			DanglingContentReferenceError,
		);
	});

	it("rejects dangling resource links and map pins", () => {
		assert.throws(
			() => createRegistry([{ ...pack, resources: [{ ...shrine, links: ["portents/greywater/npc/ghost"] }] }]),
			/refers to resource.*ghost/,
		);
		assert.throws(
			() => createRegistry([{ ...pack, imageMaps: [{ ...pack.imageMaps![0], pins: [{ id: "ghost", x: 0.5, y: 0.5, label: "Ghost", resourceId: "portents/greywater/npc/ghost" }] }] }]),
			/refers to resource.*ghost/,
		);
	});

	it("requires packaged resources to name a setting", () => {
		assert.throws(
			() => createRegistry([{ id: "loose", resources: [{ ...shrine, settingId: undefined }] }]),
			/settingId is required/,
		);
	});

	it("uses the existing declared override rules for resources", () => {
		const replacement: ContentPack = {
			id: "greywater-homebrew",
			resources: [{ ...shrine, body: "The shrine has fallen." }],
			overrides: [{ kind: "resource", id: shrine.id, reason: "campaign variant" }],
		};
		const registry = createRegistry([pack, replacement]);
		assert.equal(registry.requireResource(shrine.id).body, "The shrine has fallen.");
		assert.equal(registry.ownerOf("resource", shrine.id), "greywater-homebrew");
	});
});

describe("lookup errors", () => {
	it("lists what is available", () => {
		const registry = createRegistry([generic]);
		assert.throws(() => registry.requireTable("nope"), UnknownContentError);
		assert.throws(() => registry.requireTable("nope"), /Available: traps, wild-magic/);
	});
});
