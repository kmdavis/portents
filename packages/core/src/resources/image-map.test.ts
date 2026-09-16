import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertSettingImageMap, formatSettingImageMap, settingImageMapProblems, type SettingImageMap } from "./image-map.ts";

const map = (overrides: Partial<SettingImageMap> = {}): SettingImageMap => ({
	schemaVersion: 1,
	id: "portents/greywater/map/river-province",
	settingId: "portents/greywater",
	name: "The River Province",
	scope: "region",
	asset: {
		key: "maps/river-province.webp",
		mimeType: "image/webp",
		width: 1600,
		height: 900,
		alt: "The Greywater river running east through five named settlements.",
	},
	pins: [
		{ id: "riverside-shrine", x: 0.25, y: 0.75, label: "Old Riverside Shrine", resourceId: "portents/greywater/place/riverside-shrine" },
	],
	...overrides,
});

describe("raster setting maps", () => {
	it("accepts a non-square WebP with normalized resource pins", () => {
		assert.equal(assertSettingImageMap(map()).asset.width, 1600);
	});

	it("accepts PNG, JPG and JPEG keys matching their MIME type", () => {
		for (const [key, mimeType] of [
			["maps/world.png", "image/png"],
			["maps/world.jpg", "image/jpeg"],
			["maps/world.jpeg", "image/jpeg"],
		] as const) {
			assert.deepEqual(settingImageMapProblems(map({ asset: { ...map().asset, key, mimeType } })), [], key);
		}
	});

	it("rejects vector and mismatched image types", () => {
		assert.ok(
			settingImageMapProblems(map({ asset: { ...map().asset, key: "maps/world.svg", mimeType: "image/svg+xml" as "image/png" } })).some(
				(problem) => problem.includes("mimeType"),
			),
		);
		assert.ok(
			settingImageMapProblems(map({ asset: { ...map().asset, key: "maps/world.png", mimeType: "image/webp" } })).some(
				(problem) => problem.includes("extension"),
			),
		);
	});

	it("rejects absolute, traversal, and unsafe asset keys", () => {
		for (const key of ["/maps/world.webp", "maps/../world.webp", "maps\\world.webp", "maps/world map.webp"]) {
			assert.ok(
				settingImageMapProblems(map({ asset: { ...map().asset, key } })).some((problem) => problem.includes("package-relative")),
				key,
			);
		}
	});

	it("requires real dimensions and alt text", () => {
		const problems = settingImageMapProblems(map({ asset: { ...map().asset, width: 0, height: 2.5, alt: " " } }));
		assert.ok(problems.some((problem) => problem.includes("width")));
		assert.ok(problems.some((problem) => problem.includes("height")));
		assert.ok(problems.some((problem) => problem.includes("alt text")));
	});

	it("pins include both image edges", () => {
		assert.deepEqual(
			settingImageMapProblems(
				map({ pins: [{ id: "corners", x: 0, y: 1, label: "At the edge", resourceId: "portents/greywater/place/edge" }] }),
			),
			[],
		);
	});

	it("rejects out-of-bounds and non-finite pins", () => {
		const problems = settingImageMapProblems(
			map({ pins: [
				{ id: "left", x: -0.01, y: 0.5, label: "Left" },
				{ id: "right", x: 1.01, y: Number.NaN, label: "Right" },
			] }),
		);
		assert.equal(problems.filter((problem) => /between 0 and 1/.test(problem)).length, 3);
	});

	it("rejects duplicate pin ids and malformed resource targets", () => {
		const problems = settingImageMapProblems(
			map({ pins: [
				{ id: "shrine", x: 0.2, y: 0.2, label: "Shrine" },
				{ id: "shrine", x: 0.4, y: 0.4, label: "Other", resourceId: "bad" },
			] }),
		);
		assert.ok(problems.some((problem) => problem.includes("duplicate pin")));
		assert.ok(problems.some((problem) => problem.includes("resourceId")));
	});

	it("formats the host-resolved asset and linked pins for recall", () => {
		const text = formatSettingImageMap({ packId: "greywater-pack", map: map() });
		assert.match(text, /greywater-pack:maps\/river-province\.webp/);
		assert.match(text, /1600×900/);
		assert.match(text, /Old Riverside Shrine.*portents\/greywater\/place\/riverside-shrine/);
	});

	it("throws every problem together", () => {
		assert.throws(
			() => assertSettingImageMap(map({ name: "", scope: "", asset: { ...map().asset, alt: "" } })),
			/name must[\s\S]*scope must[\s\S]*alt text/,
		);
	});
});
