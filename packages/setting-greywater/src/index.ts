/** A deliberately small original setting proving Portents' setting contracts. */

import type { ContentPack, SettingImageMap, SettingManifest } from "@portents/core";
import { resources } from "./resources.generated.ts";

export { resources as greywaterResources } from "./resources.generated.ts";

export const greywater: SettingManifest = {
	schemaVersion: 1,
	id: "portents/greywater",
	name: "Greywater",
	summary: "A rain-soaked river province where old civic duties are literal debts owed to the water.",
	aliases: ["Greywater Province"],
};

export const greywaterRegionMap: SettingImageMap = {
	schemaVersion: 1,
	id: "portents/greywater/map/region",
	settingId: greywater.id,
	name: "Greywater Province",
	scope: "region",
	asset: {
		key: "maps/greywater-region.webp",
		mimeType: "image/webp",
		width: 1200,
		height: 510,
		alt: "An unlabeled river province: Greywater city north of the central river, a shrine on the south bank, marsh causeway to the southeast, and ruined tower in northern hills.",
	},
	pins: [
		{ id: "greywater-city", x: 0.46, y: 0.27, label: "Greywater", resourceId: "portents/greywater/place/greywater-city" },
		{ id: "riverside-shrine", x: 0.48, y: 0.68, label: "Old Riverside Shrine", resourceId: "portents/greywater/place/riverside-shrine" },
		{ id: "flooded-causeway", x: 0.76, y: 0.74, label: "Flooded Causeway", resourceId: "portents/greywater/place/flooded-causeway" },
		{ id: "north-watchtower", x: 0.31, y: 0.17, label: "North Watchtower", resourceId: "portents/greywater/place/ruined-watchtower" },
	],
};

export const greywaterSetting: ContentPack = {
	id: "setting-greywater",
	name: "Greywater setting",
	settings: [greywater],
	resources,
	imageMaps: [greywaterRegionMap],
	provenance: {
		source: "original writing and AI-generated map created for Portents; see maps/README.md",
		license: "CC0-1.0",
	},
};
