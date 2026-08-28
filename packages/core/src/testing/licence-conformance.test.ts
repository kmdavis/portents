/**
 * Tests for the conformance suite itself.
 *
 * The suite's own checks can only fire when a package is non-compliant, and the
 * packages in this repo are compliant -- so removing a check passed the whole
 * workspace. These construct the failing shapes directly.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ContentPack } from "../packs/registry.ts";
import { licenceConformanceCases } from "./licence-conformance.ts";

const table = (id: string, license: string) => ({
	id,
	name: id,
	dice: "1d1",
	entries: [{ range: [1, 1] as const, text: "x" }],
	provenance: { source: "a rulebook I own", license },
});

function check(packs: readonly ContentPack[], name: string, options: Record<string, unknown> = {}) {
	const cases = licenceConformanceCases({
		packageName: "@portent/test",
		packs,
		allow: ["CC0-1.0", "CC-BY-4.0", "UNLICENSED"],
		...options,
	});
	const found = cases.find((c) => c.name.includes(name));
	assert.ok(found, `no case matching ${JSON.stringify(name)}; have: ${cases.map((c) => c.name).join(" | ")}`);
	return found;
}

describe("the publication guard", () => {
	const withPersonal: ContentPack[] = [{ id: "p", tables: [table("t", "UNLICENSED")] }];

	it("fails a publishable package holding non-distributable content", () => {
		// The check that stops a pack of rulebook tables sitting in something
		// publishable. It cannot fire on this repo's packages, which are all either
		// distributable or already private.
		assert.throws(
			check(withPersonal, "is private", { publishable: true }).run,
			/holds content nobody may redistribute .* but is publishable/,
		);
	});

	it("passes the same package when it is private", () => {
		assert.doesNotThrow(check(withPersonal, "is private", { publishable: false }).run);
	});

	it("passes a publishable package with only distributable content", () => {
		const fine: ContentPack[] = [{ id: "p", tables: [table("t", "CC0-1.0")] }];
		assert.doesNotThrow(check(fine, "is private", { publishable: true }).run);
	});
});

describe("the licence policy guard", () => {
	it("fails a licence outside the package's own policy", () => {
		const pack: ContentPack[] = [{ id: "p", tables: [table("t", "CC-BY-4.0")] }];
		const cases = licenceConformanceCases({ packageName: "x", packs: pack, allow: ["CC0-1.0"] });
		assert.throws(cases.find((c) => c.name.includes("permits"))!.run, /outside this package's policy/);
	});
});

describe("the declared-licence guard", () => {
	it("fails when the manifest disagrees with the content", () => {
		const pack: ContentPack[] = [{ id: "p", tables: [table("t", "CC-BY-4.0")] }];
		assert.throws(
			check(pack, "matches its contents", { declaredLicense: "CC0-1.0" }).run,
			/declares "CC0-1.0" but its content is/,
		);
	});
});
