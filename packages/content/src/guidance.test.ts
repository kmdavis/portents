/**
 * The bundled guidance, checked across every pack at once.
 *
 * This is the aggregate package, so it is the only place that sees all the systems
 * together -- which is where "two packs both claim 5e" and "one pack forgot its
 * guidance" are visible.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { createRegistry } from "@portents/core";

import { bundledSystems, commonContent } from "./index.ts";

const registry = createRegistry(commonContent);

describe("bundled guidance", () => {
	it("covers every bundled system", () => {
		// A pack that ships a sheet scaffold but no guidance is the drift this move was
		// meant to prevent, in the other direction.
		for (const pack of commonContent) {
			const hasSheet = (pack.sheets ?? []).length > 0;
			const hasGuidance = (pack.guidance ?? []).length > 0;
			assert.equal(hasGuidance, hasSheet, `${pack.id} has a sheet scaffold xor guidance — they should match`);
		}
	});

	it("resolves guidance for every system it advertises", () => {
		for (const system of bundledSystems) {
			assert.ok(registry.guidanceFor(system), `no guidance resolves for advertised system ${system}`);
		}
	});

	it("gives the bare system name to the newer printing", () => {
		// The project-wide default-to-newer rule, expressed in pack aliases.
		assert.equal(registry.guidanceFor("5e")?.id, "dnd-5e-2024");
		assert.equal(registry.guidanceFor("pf2e")?.id, "pf2e-remaster");
		assert.equal(registry.guidanceFor("d&d")?.id, "dnd-5e-2024");
	});

	it("keeps each printing distinguishable from the other", () => {
		const remaster = registry.guidanceFor("pf2e (remaster)")!.body;
		const legacy = registry.guidanceFor("pf2e (legacy)")!.body;
		assert.notEqual(remaster, legacy, "both PF2E printings ship identical guidance");
		assert.match(remaster, /force barrage/i);
		assert.doesNotMatch(legacy, /force barrage/i);
	});

	it("never names a harness's tools", () => {
		// A content pack is consumed by more than one harness and cannot know what its
		// consumer calls things. The generator enforces this too; this is the check that
		// runs in a normal test pass.
		for (const id of registry.guidanceIds()) {
			const body = registry.guidanceFor(id)!.body;
			assert.doesNotMatch(body, /portents_/, `${id} names a portents_* tool`);
			assert.doesNotMatch(body, /\bslash command\b/i, `${id} assumes a command-line harness`);
		}
	});

	it("has generated modules that match their markdown", () => {
		// The markdown is the source; the generated module is what ships, because a pack
		// must stay pure data to work in a browser. Without this, editing the prose and
		// forgetting to regenerate ships the old text silently.
		// fileURLToPath, not .pathname, which percent-encodes and breaks on a checkout
		// path containing a space. The generator resolves paths from the repo root.
		const root = fileURLToPath(new URL("../../../", import.meta.url));
		execFileSync("node", ["scripts/build-guidance.mjs", "--check"], { cwd: root, stdio: "pipe" });
	});
});
