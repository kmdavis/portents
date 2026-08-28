/**
 * Guidance as a content kind.
 *
 * The point of moving it here: a system's rules and the sheet scaffold declaring that
 * system's status keys must change together. They used to live in different packages.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRegistry, DuplicateContentError, UnusedOverrideError } from "./registry.ts";
import type { ContentPack, SystemGuidance } from "./registry.ts";

const entry = (id: string, aliases: string[], body = "# Heading\n\nbody text"): SystemGuidance => ({
	id,
	aliases,
	body,
});

describe("guidance in the registry", () => {
	it("matches a system line by alias", () => {
		const registry = createRegistry([
			{ id: "p", guidance: [entry("fifth-2024", ["5e", "5e (2024)"])] } satisfies ContentPack,
		]);
		assert.equal(registry.guidanceFor("5e")?.id, "fifth-2024");
		assert.equal(registry.guidanceFor("5e (2024)")?.id, "fifth-2024");
	});

	it("falls back from a printing to the bare system", () => {
		// "5e (2024)" with only a "5e" entry loaded should still find it.
		const registry = createRegistry([{ id: "p", guidance: [entry("five", ["5e"])] } satisfies ContentPack]);
		assert.equal(registry.guidanceFor("5e (2024)")?.id, "five");
	});

	it("returns nothing for a system nobody claimed", () => {
		// Never a guess. A wrong system's rules are worse than none, because the GM
		// states them with confidence.
		const registry = createRegistry([{ id: "p", guidance: [entry("five", ["5e"])] } satisfies ContentPack]);
		assert.equal(registry.guidanceFor("Call of Cthulhu"), undefined);
		assert.equal(registry.guidanceFor("pf2e"), undefined);
	});

	it("lets a later pack override declared guidance", () => {
		const base: ContentPack = { id: "base", guidance: [entry("five", ["5e"], "# Base")] };
		const house: ContentPack = {
			id: "house",
			guidance: [entry("five", ["5e"], "# House rules")],
			overrides: [{ kind: "guidance", id: "five", reason: "house rules" }],
		};
		const registry = createRegistry([base, house]);
		assert.match(registry.guidanceFor("5e")!.body, /House rules/);
		assert.deepEqual(
			registry.appliedOverrides().map((o) => [o.kind, o.id, o.by]),
			[["guidance", "five", "house"]],
		);
	});

	it("rejects an undeclared collision, naming both packs", () => {
		const a: ContentPack = { id: "pack-a", guidance: [entry("five", ["5e"])] };
		const b: ContentPack = { id: "pack-b", guidance: [entry("five", ["5e"])] };
		assert.throws(() => createRegistry([a, b]), (error: unknown) => {
			assert.ok(error instanceof DuplicateContentError);
			assert.match(error.message, /pack-a/);
			assert.match(error.message, /pack-b/);
			return true;
		});
	});

	it("rejects a stale override declaration", () => {
		const pack: ContentPack = {
			id: "stale",
			guidance: [entry("five", ["5e"])],
			overrides: [{ kind: "guidance", id: "nothing-defines-this" }],
		};
		assert.throws(() => createRegistry([pack]), UnusedOverrideError);
	});

	it("lists ids sorted", () => {
		const registry = createRegistry([
			{ id: "p", guidance: [entry("zeta", ["z"]), entry("alpha", ["a"])] } satisfies ContentPack,
		]);
		assert.deepEqual(registry.guidanceIds(), ["alpha", "zeta"]);
	});

	it("shares alias matching with sheet scaffolds", () => {
		// The reason matchBySystemAlias was extracted rather than copied: guidance and a
		// sheet scaffold for the same system must agree on what a system line means.
		const registry = createRegistry([
			{
				id: "p",
				guidance: [entry("five", ["5e (2024)"])],
				sheets: [
					{
						id: "five",
						name: "Fifth",
						aliases: ["5e (2024)"],
						sections: [],
						status: [],
						abilities: [],
					},
				],
			} satisfies ContentPack,
		]);
		for (const line of ["5e (2024)", "5e 2024", "5E (2024)"]) {
			assert.equal(registry.guidanceFor(line)?.id, registry.sheetFor(line)?.id, `disagreement on ${line}`);
		}
	});
});
