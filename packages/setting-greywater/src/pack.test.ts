import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { createRegistry, parseResourceDocument } from "@portents/core";
import { licenceConformanceCases } from "@portents/core/testing";

import { greywater, greywaterRegionMap, greywaterResources, greywaterSetting } from "./index.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function markdownFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true })
		.flatMap((entry) => {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) return markdownFiles(path);
			return entry.name.endsWith(".md") ? [path] : [];
		})
		.sort();
}

function compareId(a: { id: string }, b: { id: string }): number {
	if (a.id < b.id) return -1;
	if (a.id > b.id) return 1;
	return 0;
}

function webpDimensions(bytes: Buffer): { width: number; height: number } {
	assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF", "not a RIFF file");
	assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP", "a renamed PNG is not WebP");
	assert.equal(bytes.subarray(12, 16).toString("ascii"), "VP8 ", "fixture should use ordinary lossy WebP");
	assert.deepEqual([...bytes.subarray(23, 26)], [0x9d, 0x01, 0x2a], "missing VP8 frame header");
	return {
		width: bytes.readUInt16LE(26) & 0x3fff,
		height: bytes.readUInt16LE(28) & 0x3fff,
	};
}

describe("source Markdown", () => {
	it("matches the generated browser data exactly", () => {
		const parsed = markdownFiles(join(root, "resources")).map((path) => parseResourceDocument(readFileSync(path, "utf8")));
		assert.deepEqual(greywaterResources, parsed);
	});

	it("has enough linked topics to prove retrieval without becoming a content project", () => {
		assert.equal(greywaterResources.length, 7);
		assert.ok(greywaterResources.some((resource) => resource.kind === "npc"));
		assert.ok(greywaterResources.some((resource) => resource.kind === "place"));
		assert.ok(greywaterResources.some((resource) => resource.kind === "faction"));
		assert.ok(greywaterResources.some((resource) => resource.kind === "thread"));
		assert.ok(greywaterResources.every((resource) => (resource.links?.length ?? 0) > 0));
	});
});

describe("the setting registry", () => {
	const registry = createRegistry([greywaterSetting]);

	it("finds the setting and every resource", () => {
		assert.equal(registry.requireSetting(greywater.id), greywater);
		assert.deepEqual(registry.resourcesForSetting(greywater.id), [...greywaterResources].sort(compareId));
	});

	it("resolves every resource link and map pin", () => {
		for (const resource of greywaterResources) {
			for (const link of resource.links ?? []) assert.ok(registry.resource(link), `${resource.id} -> ${link}`);
		}
		for (const pin of greywaterRegionMap.pins ?? []) {
			assert.ok(pin.resourceId, `${pin.id} has no resource target`);
			assert.ok(registry.resource(pin.resourceId), pin.resourceId);
		}
	});

	it("records which package owns the opaque map asset", () => {
		assert.equal(registry.ownerOf("image-map", greywaterRegionMap.id), greywaterSetting.id);
	});
});

describe("the raster map asset", () => {
	it("is a real WebP whose bytes match the declared dimensions", () => {
		const bytes = readFileSync(join(root, greywaterRegionMap.asset.key));
		assert.deepEqual(webpDimensions(bytes), {
			width: greywaterRegionMap.asset.width,
			height: greywaterRegionMap.asset.height,
		});
	});

	it("stays small enough to bundle or copy without dominating a setting package", () => {
		const bytes = readFileSync(join(root, greywaterRegionMap.asset.key));
		assert.ok(bytes.byteLength < 150_000, `map is ${(bytes.byteLength / 1024).toFixed(0)} KiB`);
	});
});

describe("licence conformance", () => {
	for (const testCase of licenceConformanceCases({
		packageName: "@portents/setting-greywater",
		packs: [greywaterSetting],
		allow: ["CC0-1.0"],
		declaredLicense: "CC0-1.0",
		publishable: true,
		noticeExists: false,
	})) {
		it(testCase.name, testCase.run);
	}
});
