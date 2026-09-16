/** Raster setting maps: opaque image assets plus normalized resource pins. */

import type { Provenance } from "../packs/attribution.ts";
import { assertValidKey } from "../ports/storage.ts";
import { isNamespacedId, RESOURCE_SCHEMA_VERSION, ResourceContractError } from "./resource.ts";

export const SETTING_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type SettingImageMimeType = (typeof SETTING_IMAGE_MIME_TYPES)[number];

export interface SettingMapAsset {
	/** Opaque package-relative key. The host resolves `(packId, key)`. */
	readonly key: string;
	readonly mimeType: SettingImageMimeType;
	readonly width: number;
	readonly height: number;
	readonly alt: string;
}

export interface SettingMapPin {
	readonly id: string;
	readonly x: number;
	readonly y: number;
	readonly label: string;
	readonly resourceId?: string;
}

export interface SettingImageMap {
	readonly schemaVersion: typeof RESOURCE_SCHEMA_VERSION;
	readonly id: string;
	readonly settingId: string;
	readonly name: string;
	/** Open vocabulary: world, nation, region, city, or a setting's own term. */
	readonly scope: string;
	readonly asset: SettingMapAsset;
	readonly pins?: readonly SettingMapPin[];
	readonly provenance?: Provenance;
}

export interface SettingImageMapRecord {
	readonly packId: string;
	readonly map: SettingImageMap;
}

const PIN_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

function extensionMatches(key: string, mimeType: SettingImageMimeType): boolean {
	const lower = key.toLowerCase();
	if (mimeType === "image/png") return lower.endsWith(".png");
	if (mimeType === "image/webp") return lower.endsWith(".webp");
	return lower.endsWith(".jpg") || lower.endsWith(".jpeg");
}

export function settingImageMapProblems(map: SettingImageMap): string[] {
	const problems: string[] = [];
	if (map.schemaVersion !== RESOURCE_SCHEMA_VERSION) {
		problems.push(`schemaVersion must be ${RESOURCE_SCHEMA_VERSION}, got ${String(map.schemaVersion)}`);
	}
	if (!isNamespacedId(map.settingId)) problems.push(`settingId must be a lowercase namespaced id, got ${JSON.stringify(map.settingId)}`);
	if (!isNamespacedId(map.id)) problems.push(`id must be a lowercase namespaced id, got ${JSON.stringify(map.id)}`);
	if (isNamespacedId(map.settingId) && !map.id.startsWith(`${map.settingId}/`)) {
		problems.push(`map id must start with settingId plus "/": ${map.settingId}/`);
	}
	if (!map.name.trim()) problems.push("name must not be empty");
	if (!map.scope.trim()) problems.push("scope must not be empty");
	try {
		assertValidKey(map.asset.key);
	} catch (error) {
		problems.push(`asset key must be package-relative and storage-safe: ${(error as Error).message}`);
	}
	if (!SETTING_IMAGE_MIME_TYPES.includes(map.asset.mimeType)) {
		problems.push(`mimeType must be ${SETTING_IMAGE_MIME_TYPES.join(", ")}`);
	} else if (!extensionMatches(map.asset.key, map.asset.mimeType)) {
		problems.push(`asset extension does not match ${map.asset.mimeType}`);
	}
	if (!Number.isInteger(map.asset.width) || map.asset.width < 1) problems.push("asset width must be a positive integer");
	if (!Number.isInteger(map.asset.height) || map.asset.height < 1) problems.push("asset height must be a positive integer");
	if (!map.asset.alt.trim()) problems.push("asset alt text must not be empty");

	const pinIds = new Set<string>();
	for (const pin of map.pins ?? []) {
		if (!PIN_ID.test(pin.id)) problems.push(`pin id must be a lowercase storage-safe segment, got ${JSON.stringify(pin.id)}`);
		if (pinIds.has(pin.id)) problems.push(`duplicate pin id ${JSON.stringify(pin.id)}`);
		pinIds.add(pin.id);
		if (!Number.isFinite(pin.x) || pin.x < 0 || pin.x > 1) problems.push(`pin ${JSON.stringify(pin.id)} x must be between 0 and 1`);
		if (!Number.isFinite(pin.y) || pin.y < 0 || pin.y > 1) problems.push(`pin ${JSON.stringify(pin.id)} y must be between 0 and 1`);
		if (!pin.label.trim()) problems.push(`pin ${JSON.stringify(pin.id)} label must not be empty`);
		if (pin.resourceId && !isNamespacedId(pin.resourceId)) {
			problems.push(`pin ${JSON.stringify(pin.id)} resourceId must be namespaced`);
		}
	}
	return [...new Set(problems)];
}

export function assertSettingImageMap(map: SettingImageMap): SettingImageMap {
	const problems = settingImageMapProblems(map);
	if (problems.length > 0) throw new ResourceContractError(`Invalid setting map ${JSON.stringify(map.id)}`, problems);
	return map;
}

export function formatSettingImageMap(record: SettingImageMapRecord): string {
	const map = record.map;
	const lines = [
		`# ${map.name}`,
		"",
		`- **ID:** \`${map.id}\``,
		`- **Setting:** \`${map.settingId}\``,
		`- **Scope:** ${map.scope}`,
		`- **Asset:** \`${record.packId}:${map.asset.key}\` (${map.asset.mimeType}, ${map.asset.width}×${map.asset.height})`,
		`- **Alt:** ${map.asset.alt}`,
	];
	if (map.pins?.length) {
		lines.push("", "## Pins", "");
		for (const pin of map.pins) {
			const target = pin.resourceId ? ` → \`${pin.resourceId}\`` : "";
			lines.push(`- **${pin.label}** (${pin.x}, ${pin.y})${target}`);
		}
	}
	return `${lines.join("\n")}\n`;
}
