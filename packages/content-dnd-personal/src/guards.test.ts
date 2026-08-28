import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createRegistry, packageLicenseFor, renderNotice } from "@portent/core";
import { licenceConformanceCases } from "@portent/core/testing";
import { personalContent } from "./index.ts";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url).pathname, "utf8")) as {
	license: string;
	private?: boolean;
	files?: string[];
};

const items = [{ id: `pack:${personalContent.id}`, provenance: personalContent.provenance }];

describe("licence conformance", () => {
	for (const check of licenceConformanceCases({
		packageName: "@portent/content-dnd-personal",
		packs: [personalContent],
		allow: ["UNLICENSED"],
		declaredLicense: manifest.license,
		publishable: manifest.private !== true,
		noticeExists: existsSync(new URL("../NOTICE.md", import.meta.url).pathname),
	})) {
		it(check.name, check.run);
	}
});

describe("the guards against publication", () => {
	// Four independent guards, because the risk here is a single mistake by
	// someone who does not know why any one of them is there.
	it("is marked private, so npm refuses to publish it", () => {
		assert.equal(manifest.private, true);
	});

	it("declares UNLICENSED, npm's value for granting no rights", () => {
		assert.equal(manifest.license, "UNLICENSED");
	});

	it("would pack nothing even if publication were forced", () => {
		assert.deepEqual(manifest.files, []);
	});

	it("reports UNLICENSED even when mixed with freely licensed content", () => {
		// UNLICENSED dominates, so the package can never look partly shareable.
		assert.equal(
			packageLicenseFor([
				{ id: "a", provenance: { source: "original writing", license: "CC0-1.0" } },
				...items,
			]),
			"UNLICENSED",
		);
	});

	it("generates no NOTICE, because nothing here ships", () => {
		assert.equal(renderNotice("@portent/content-dnd-personal", items), undefined);
	});

	it("refuses an attribution block on non-distributable content", () => {
		const cases = licenceConformanceCases({
			packageName: "x",
			packs: [
				{
					id: "bad",
					tables: [
						{
							id: "t",
							name: "t",
							dice: "1d1",
							entries: [{ range: [1, 1], text: "x" }],
							provenance: {
								source: "a book",
								license: "UNLICENSED",
								attribution: {
									title: "t",
									creator: "c",
									license: "CC-BY-4.0",
									licenseUrl: "u",
									modified: false,
								},
							},
						},
					],
				},
			],
			allow: ["UNLICENSED"],
		});
		const check = cases.find((c) => c.name.startsWith("satisfies"))!;
		assert.throws(check.run, /does not create a right to redistribute/);
	});
});

describe("layering", () => {
	it("loads on top of the published packs", () => {
		const registry = createRegistry([personalContent]);
		assert.ok(registry.tableIds().length === 0, "ships empty on purpose");
	});

	it("is the last pack, so it wins", () => {
		// Documented ordering, asserted: a personal override of a published table
		// only works if this pack comes last.
		const published = {
			id: "pub",
			tables: [{ id: "t", name: "pub", dice: "1d1", entries: [{ range: [1, 1] as const, text: "published" }] }],
		};
		const personal = {
			...personalContent,
			tables: [{ id: "t", name: "mine", dice: "1d1", entries: [{ range: [1, 1] as const, text: "personal" }] }],
			overrides: [{ kind: "table" as const, id: "t" }],
		};
		const registry = createRegistry([published, personal]);
		assert.equal(registry.requireTable("t").entries[0].text, "personal");
	});
});
