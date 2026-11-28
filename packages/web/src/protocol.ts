/**
 * Host-neutral, serializable command contract for the shared gameplay API.
 *
 * Campaign IDs are opaque boundary identities; campaign-scoped commands name
 * their campaign explicitly. The local adapter maps legacy slugs by default;
 * hosted adapters must resolve their own IDs rather than expose storage keys.
 */
import { isResourceSegment, LIKELIHOODS, ORACLE_KINDS, resourceProblems, WORLD_SECTIONS } from "@portents/core";
import type { Actor, Frontmatter, Likelihood, OracleKind, RememberResourceInput, ResourceAudience, TileSource, WorldSection } from "@portents/core";
export const PROTOCOL_VERSION = 1 as const;

export type CampaignCommand =
	| { readonly type: "campaign.open" | "campaign.load" | "campaign.close" | "campaign.brief"; readonly campaignId: string }
	| { readonly type: "campaign.journal"; readonly campaignId: string; readonly heading: string; readonly body: string }
	| { readonly type: "campaign.scene"; readonly campaignId: string; readonly summary: string; readonly location?: string; readonly time?: string; readonly tension?: string }
	| { readonly type: "campaign.world"; readonly campaignId: string; readonly section?: WorldSection; readonly body?: string }
	| { readonly type: "campaign.setting"; readonly campaignId: string; readonly setting?: string }
	| { readonly type: "campaign.system"; readonly campaignId: string; readonly system: string }
	| { readonly type: "campaign.clock"; readonly campaignId: string; readonly name: string; readonly filled?: number; readonly segments?: number }
	| { readonly type: "campaign.list" }
	| { readonly type: "campaign.create"; readonly name: string; readonly system: string; readonly premise?: string; readonly tone?: string; readonly safety?: string; readonly settingId?: string };

export type Command = CampaignCommand
	| { readonly type: "dice.roll"; readonly expression: string; readonly dc?: number; readonly reason?: string; readonly campaignId?: string }
	| { readonly type: "dice.odds"; readonly expression: string; readonly dc?: number }
	| { readonly type: "deck.list" }
	| { readonly type: "deck.draw"; readonly deckId: string; readonly count?: number; readonly campaignId?: string }
	| { readonly type: "table.list" }
	| { readonly type: "table.roll"; readonly tableId: string; readonly campaignId?: string }
	| { readonly type: "oracle.answer"; readonly kind: OracleKind; readonly question?: string; readonly likelihood?: Likelihood; readonly campaignId?: string }
	| { readonly type: "map.generate"; readonly rooms?: number; readonly seed?: string }
	| { readonly type: "map.moveActor"; readonly tile: TileSource; readonly actors: readonly Actor[]; readonly explored?: readonly number[]; readonly sightRadius?: number; readonly actorId: string; readonly x: number; readonly y: number }
	| { readonly type: "sheet.list"; readonly campaignId: string }
	| { readonly type: "sheet.create"; readonly campaignId: string; readonly character: string; readonly main?: boolean; readonly concept?: string; readonly status?: Readonly<Record<string, string>>; readonly abilities?: Readonly<Record<string, string>> }
	| { readonly type: "sheet.setMain"; readonly campaignId: string; readonly character: string }
	| { readonly type: "sheet.read"; readonly campaignId: string; readonly character?: string }
	| { readonly type: "sheet.patchStatus"; readonly campaignId: string; readonly character?: string; readonly status: Readonly<Record<string, string>> }
	| { readonly type: "sheet.setSection" | "sheet.appendSection"; readonly campaignId: string; readonly character?: string; readonly section: string; readonly body: string }
	| { readonly type: "recall"; readonly campaignId: string; readonly id?: string; readonly query?: string; readonly kind?: string; readonly limit?: number }
	| { readonly type: "remember"; readonly campaignId: string; readonly resource: RememberResourceInput }
	| { readonly type: "guidance.get"; readonly topic: string }
	| { readonly type: "ledger.verify"; readonly campaignId: string; readonly id: string };

export interface CommandRequest { readonly version: number; readonly command: Command; readonly expectedRevision?: number; readonly idempotencyKey?: string }
export interface LedgerReference { readonly id: string; readonly kind: string }
export type CommandResult =
	| { readonly type: "text"; readonly text: string; readonly ledger?: readonly LedgerReference[] }
	| { readonly type: "roll"; readonly lines: readonly string[]; readonly totals: readonly number[]; readonly ledger: readonly LedgerReference[] }
	| { readonly type: "map"; readonly ascii: string; readonly svg: string; readonly seed: string }
	| { readonly type: "map-view"; readonly tile: TileSource; readonly actors: readonly Actor[]; readonly explored: readonly number[]; readonly visible: readonly number[]; readonly sightRadius?: number }
	| { readonly type: "campaigns"; readonly campaigns: readonly { readonly id: string; readonly name: string; readonly system?: string }[] }
	| { readonly type: "catalog"; readonly ids: readonly string[] }
	| { readonly type: "clock"; readonly name: string; readonly filled: number; readonly segments: number }
	| { readonly type: "remembered"; readonly id: string; readonly name: string; readonly path: string }
	| { readonly type: "empty" };
type TextResult = Extract<CommandResult, { readonly type: "text" }>;
type EmptyResult = Extract<CommandResult, { readonly type: "empty" }>;
type CampaignsResult = Extract<CommandResult, { readonly type: "campaigns" }>;
type CatalogResult = Extract<CommandResult, { readonly type: "catalog" }>;
type RollResult = Extract<CommandResult, { readonly type: "roll" }>;
type MapResult = Extract<CommandResult, { readonly type: "map" }>;
type MapViewResult = Extract<CommandResult, { readonly type: "map-view" }>;
type ClockResult = Extract<CommandResult, { readonly type: "clock" }>;
type RememberedResult = Extract<CommandResult, { readonly type: "remembered" }>;

export interface CommandResultMap {
	"campaign.open": TextResult; "campaign.load": TextResult; "campaign.close": EmptyResult; "campaign.brief": TextResult;
	"campaign.journal": EmptyResult; "campaign.scene": EmptyResult; "campaign.world": TextResult | EmptyResult;
	"campaign.setting": EmptyResult; "campaign.system": EmptyResult; "campaign.clock": ClockResult;
	"campaign.list": CampaignsResult; "campaign.create": CampaignsResult;
	"dice.roll": RollResult; "dice.odds": TextResult; "deck.list": CatalogResult; "deck.draw": TextResult;
	"table.list": CatalogResult; "table.roll": TextResult; "oracle.answer": TextResult;
	"map.generate": MapResult; "map.moveActor": MapViewResult;
	"sheet.list": TextResult; "sheet.create": TextResult; "sheet.setMain": EmptyResult; "sheet.read": TextResult;
	"sheet.patchStatus": TextResult; "sheet.setSection": EmptyResult; "sheet.appendSection": EmptyResult;
	recall: TextResult; remember: RememberedResult; "guidance.get": TextResult; "ledger.verify": TextResult;
}
export type ResultFor<C extends Command> = CommandResultMap[C["type"]];

export const PROTOCOL_ERROR_CODES = [
	"INVALID_INPUT",
	"UNSUPPORTED_VERSION",
	"UNAUTHENTICATED",
	"UNAUTHORIZED",
	"NOT_FOUND",
	"STALE_REVISION",
	"IDEMPOTENCY_CONFLICT",
	"STORAGE_FAILURE",
	"INTERNAL_ERROR",
] as const;
export type ProtocolErrorCode = (typeof PROTOCOL_ERROR_CODES)[number];
export interface ProtocolError { readonly code: ProtocolErrorCode; readonly message: string; readonly details?: Readonly<Record<string, unknown>> }
export interface CommandResponse { readonly version: number; readonly result?: CommandResult; readonly error?: ProtocolError; readonly revision?: number }

export class ProtocolValidationError extends Error {
	readonly code: ProtocolErrorCode;
	readonly details: Readonly<Record<string, unknown>> | undefined;
	constructor(message: string, code: ProtocolErrorCode = "INVALID_INPUT", details?: Readonly<Record<string, unknown>>) {
		super(message);
		this.name = "ProtocolValidationError";
		this.code = code;
		this.details = details;
	}
}


export const isProtocolRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === "string";
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const bool = (value: unknown): value is boolean => typeof value === "boolean";
const stringMap = (value: unknown): boolean => isProtocolRecord(value) && Object.values(value).every(string);
const actorKinds = ["pc", "ally", "neutral", "foe", "object"] as const;
export function isProtocolActor(value: unknown): value is Actor {
	return isProtocolRecord(value) &&
		Object.keys(value).every((key) => ["id", "name", "x", "y", "kind", "glyph", "colour", "sees", "sightRadius"].includes(key)) &&
		string(value.id) && string(value.name) && Number.isInteger(value.x) && Number.isInteger(value.y) &&
		typeof value.kind === "string" && actorKinds.includes(value.kind as (typeof actorKinds)[number]) &&
		(value.glyph === undefined || string(value.glyph)) &&
		(value.colour === undefined || string(value.colour)) &&
		(value.sees === undefined || bool(value.sees)) &&
		(value.sightRadius === undefined || (finite(value.sightRadius) && value.sightRadius >= 0));
}
export function isProtocolTileSource(value: unknown): value is TileSource {
	return isProtocolRecord(value) &&
		Object.keys(value).every((key) => ["id", "name", "tags", "note", "art"].includes(key)) &&
		string(value.id) && string(value.name) && Array.isArray(value.art) && value.art.every(string) &&
		(value.tags === undefined || (Array.isArray(value.tags) && value.tags.every(string))) &&
		(value.note === undefined || string(value.note));
}
const numberArray = (value: unknown): boolean =>
	Array.isArray(value) && value.every((item) => Number.isInteger(item) && Number.isFinite(item) && item >= 0);
const isScalar = (value: unknown): boolean =>
	typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
function isFrontmatter(value: unknown): value is Frontmatter {
	return isProtocolRecord(value) && Object.entries(value).every(([key, item]) =>
		/^[A-Za-z_][A-Za-z0-9_ -]*$/.test(key) &&
		(isScalar(item) || (Array.isArray(item) && item.every(isScalar)) ||
			(isProtocolRecord(item) && Object.values(item).every(isScalar))));
}
function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every(string);
}
function isRememberResourceInput(value: unknown): value is RememberResourceInput {
	if (!isProtocolRecord(value) ||
		Object.keys(value).some((key) => !["path", "id", "kind", "name", "body", "aliases", "tags", "links", "audience", "supersedes", "metadata"].includes(key))) return false;
	for (const key of ["path", "id", "kind", "name", "body", "supersedes"]) {
		if (Object.hasOwn(value, key) && !string(value[key])) return false;
	}
	if (value.path !== undefined && (!string(value.path) || value.path.length === 0)) return false;
	if (value.kind !== undefined && (!string(value.kind) || !isResourceSegment(value.kind))) return false;
	if (value.name !== undefined && (!string(value.name) || !value.name.trim())) return false;
	for (const key of ["aliases", "tags", "links"]) {
		if (Object.hasOwn(value, key) && !isStringArray(value[key])) return false;
	}
	if (Object.hasOwn(value, "audience") && (!Array.isArray(value.audience) ||
		!value.audience.every((item): item is ResourceAudience => string(item) &&
			(item === "all" || item === "gm" || /^participant\/[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(item))))) return false;
	if (Object.hasOwn(value, "metadata") && !isFrontmatter(value.metadata)) return false;
	if (value.path === undefined && (!string(value.kind) || !string(value.name))) return false;
	const input = value as unknown as RememberResourceInput;
	return resourceProblems({
		schemaVersion: 1,
		id: input.id ?? "campaign/protocol/resource",
		kind: input.kind ?? "note",
		name: input.name ?? "resource",
		body: input.body ?? "",
		...(input.aliases === undefined ? {} : { aliases: input.aliases }),
		...(input.tags === undefined ? {} : { tags: input.tags }),
		...(input.links === undefined ? {} : { links: input.links }),
		...(input.audience === undefined ? {} : { audience: input.audience }),
		...(input.supersedes === undefined ? {} : { supersedes: input.supersedes }),
		...(input.metadata === undefined ? {} : { metadata: input.metadata }),
	}).length === 0;
}
const oneOf = (values: readonly string[], value: unknown): boolean =>
	typeof value === "string" && values.includes(value);

/** Reject values that JSON cannot represent faithfully, including cycles. */
export function isProtocolJsonValue(value: unknown, ancestors = new Set<object>()): boolean {
	if (value === null || typeof value === "string" || typeof value === "boolean") return true;
	if (typeof value === "number") return Number.isFinite(value);
	if (typeof value !== "object") return false;
	if (ancestors.has(value)) return false;
	ancestors.add(value);
	let valid = false;
	if (Array.isArray(value)) {
		valid = Object.keys(value).length === value.length &&
			Object.keys(value).every((key) => /^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length) &&
			value.every((item) => isProtocolJsonValue(item, ancestors));
	} else {
		const prototype = Object.getPrototypeOf(value);
		valid = (prototype === Object.prototype || prototype === null) &&
			Reflect.ownKeys(value).every((key) => typeof key === "string" &&
				Object.prototype.propertyIsEnumerable.call(value, key) &&
				isProtocolJsonValue((value as Record<string, unknown>)[key], ancestors));
	}
	ancestors.delete(value);
	return valid;
}

const fields: Readonly<Record<string, readonly string[]>> = {
	"campaign.open": ["campaignId"], "campaign.load": ["campaignId"], "campaign.close": ["campaignId"], "campaign.brief": ["campaignId"],
	"campaign.journal": ["campaignId", "heading", "body"], "campaign.scene": ["campaignId", "summary", "location", "time", "tension"],
	"campaign.world": ["campaignId", "section", "body"], "campaign.setting": ["campaignId", "setting"], "campaign.system": ["campaignId", "system"],
	"campaign.clock": ["campaignId", "name", "filled", "segments"], "campaign.list": [],
	"campaign.create": ["name", "system", "premise", "tone", "safety", "settingId"],
	"dice.roll": ["expression", "dc", "reason", "campaignId"], "dice.odds": ["expression", "dc"],
	"deck.list": [], "deck.draw": ["deckId", "count", "campaignId"], "table.list": [], "table.roll": ["tableId", "campaignId"],
	"oracle.answer": ["kind", "question", "likelihood", "campaignId"],
	"map.generate": ["rooms", "seed"], "map.moveActor": ["tile", "actors", "explored", "sightRadius", "actorId", "x", "y"],
	"sheet.list": ["campaignId"], "sheet.create": ["campaignId", "character", "main", "concept", "status", "abilities"],
	"sheet.setMain": ["campaignId", "character"], "sheet.read": ["campaignId", "character"],
	"sheet.patchStatus": ["campaignId", "character", "status"], "sheet.setSection": ["campaignId", "character", "section", "body"],
	"sheet.appendSection": ["campaignId", "character", "section", "body"], "recall": ["campaignId", "id", "query", "kind", "limit"],
	"remember": ["campaignId", "resource"], "guidance.get": ["topic"], "ledger.verify": ["campaignId", "id"],
};
const required: Readonly<Record<string, readonly string[]>> = {
	"campaign.open": ["campaignId"], "campaign.load": ["campaignId"], "campaign.close": ["campaignId"], "campaign.brief": ["campaignId"],
	"campaign.journal": ["campaignId", "heading", "body"], "campaign.scene": ["campaignId", "summary"], "campaign.world": ["campaignId"],
	"campaign.setting": ["campaignId"], "campaign.system": ["campaignId", "system"], "campaign.clock": ["campaignId", "name"],
	"campaign.create": ["name", "system"], "dice.roll": ["expression"], "dice.odds": ["expression"], "deck.draw": ["deckId"],
	"table.roll": ["tableId"], "oracle.answer": ["kind"], "map.moveActor": ["tile", "actors", "actorId", "x", "y"],
	"sheet.list": ["campaignId"], "sheet.create": ["campaignId", "character"], "sheet.setMain": ["campaignId", "character"],
	"sheet.read": ["campaignId"], "sheet.patchStatus": ["campaignId", "status"], "sheet.setSection": ["campaignId", "section", "body"],
	"sheet.appendSection": ["campaignId", "section", "body"], "recall": ["campaignId"], "remember": ["campaignId", "resource"],
	"guidance.get": ["topic"], "ledger.verify": ["campaignId", "id"],
};
const stringFields = ["campaignId", "name", "system", "heading", "body", "summary", "location", "time", "tension", "section", "setting", "settingId", "premise", "tone", "safety", "expression", "reason", "deckId", "tableId", "kind", "question", "likelihood", "seed", "actorId", "character", "concept", "id", "query", "topic"];
const numberFields = ["dc", "filled", "segments", "count", "rooms", "limit", "x", "y", "sightRadius"];

/** Parse untrusted data, rejecting unknown fields and values outside JSON. */
export function parseCommandRequest(value: unknown): CommandRequest {
	if (!isProtocolRecord(value) || !Number.isInteger(value.version) || !isProtocolRecord(value.command)) {
		throw new ProtocolValidationError("Expected a versioned command request");
	}
	if (Object.keys(value).some((key) => key !== "version" && key !== "command" && key !== "expectedRevision" && key !== "idempotencyKey")) {
		throw new ProtocolValidationError("Request contains an unknown field");
	}
	if (Object.hasOwn(value, "expectedRevision") &&
		(typeof value.expectedRevision !== "number" || !Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 0)) {
		throw new ProtocolValidationError("expectedRevision must be a non-negative safe integer");
	}
	if (Object.hasOwn(value, "idempotencyKey") &&
		(typeof value.idempotencyKey !== "string" || value.idempotencyKey.length < 1 || value.idempotencyKey.length > 256)) {
		throw new ProtocolValidationError("idempotencyKey must be a non-empty string of at most 256 characters");
	}
	if (value.version !== PROTOCOL_VERSION) {
		throw new ProtocolValidationError(`Unsupported protocol version: ${String(value.version)}`, "UNSUPPORTED_VERSION");
	}
	const c = value.command;
	const type = c.type;
	if (!string(type)) throw new ProtocolValidationError("Command type must be a string");
	if (!Object.hasOwn(fields, type)) throw new ProtocolValidationError(`Unknown command type: ${type}`);
	const allowed = fields[type]!;
	if (Object.keys(c).some((key) => key !== "type" && !allowed.includes(key))) throw new ProtocolValidationError("Command contains an unknown field");
	for (const key of stringFields) if (Object.hasOwn(c, key) && !string(c[key])) throw new ProtocolValidationError(`${key} must be a string`);
	for (const key of numberFields) if (Object.hasOwn(c, key) && !finite(c[key])) throw new ProtocolValidationError(`${key} must be a finite number`);
	if (Object.hasOwn(c, "main") && !bool(c.main)) throw new ProtocolValidationError("main must be a boolean");
	if (Object.hasOwn(c, "status") && !stringMap(c.status)) throw new ProtocolValidationError("status must be a string map");
	if (Object.hasOwn(c, "abilities") && !stringMap(c.abilities)) throw new ProtocolValidationError("abilities must be a string map");
	if (Object.hasOwn(c, "resource") && !isRememberResourceInput(c.resource)) throw new ProtocolValidationError("resource must match the remember-resource schema");
	if (Object.hasOwn(c, "tile") && !isProtocolTileSource(c.tile)) throw new ProtocolValidationError("tile must be a tile source");
	if (Object.hasOwn(c, "actors") && (!Array.isArray(c.actors) || !c.actors.every(isProtocolActor))) throw new ProtocolValidationError("actors must be valid map actors");
	if (Object.hasOwn(c, "explored") && !numberArray(c.explored)) throw new ProtocolValidationError("explored must be an array of non-negative cell indexes");
	if (Object.hasOwn(c, "sightRadius") && (!finite(c.sightRadius) || c.sightRadius < 0)) throw new ProtocolValidationError("sightRadius must be non-negative");
	if (type === "oracle.answer" && (!oneOf(ORACLE_KINDS, c.kind) || (c.likelihood !== undefined && !oneOf(LIKELIHOODS, c.likelihood)))) {
		throw new ProtocolValidationError("Oracle kind or likelihood is unsupported");
	}
	if (type === "campaign.world" && c.section !== undefined && !oneOf(WORLD_SECTIONS, c.section)) {
		throw new ProtocolValidationError("Unknown campaign world section");
	}
	if (type === "map.moveActor" && (!Number.isInteger(c.x) || !Number.isInteger(c.y))) {
		throw new ProtocolValidationError("Map coordinates must be integers");
	}
	if (type === "deck.draw" && c.count !== undefined && (typeof c.count !== "number" || !Number.isInteger(c.count) || c.count < 1)) {
		throw new ProtocolValidationError("Draw count must be a positive integer");
	}
	if (type === "campaign.clock" && c.segments !== undefined && (typeof c.segments !== "number" || !Number.isInteger(c.segments) || c.segments < 1)) {
		throw new ProtocolValidationError("Clock segments must be a positive integer");
	}
	if (type === "map.generate" && c.rooms !== undefined && (typeof c.rooms !== "number" || !Number.isInteger(c.rooms) || c.rooms < 1)) {
		throw new ProtocolValidationError("Map room count must be a positive integer");
	}
	if (type === "recall" && c.limit !== undefined && (typeof c.limit !== "number" || !Number.isInteger(c.limit) || c.limit < 1)) {
		throw new ProtocolValidationError("Recall limit must be a positive integer");
	}
	for (const key of required[type] ?? []) {
		const valid = key === "status" ? stringMap(c[key]) : key === "resource" ? isRememberResourceInput(c[key]) :
			key === "tile" ? isProtocolTileSource(c[key]) : key === "actors" ? Array.isArray(c[key]) && (c[key] as unknown[]).every(isProtocolActor) :
			key === "x" || key === "y" ? finite(c[key]) : string(c[key]);
		if (!Object.hasOwn(c, key) || !valid) throw new ProtocolValidationError(`Missing or invalid required field for ${type}: ${key}`);
	}
	if (!isProtocolJsonValue(value)) throw new ProtocolValidationError("Command request must contain only JSON values");
	return value as unknown as CommandRequest;
}

/** Serialize only validated requests. */
export function serializeCommandRequest(value: unknown): string {
	const request = parseCommandRequest(value);
	try {
		const encoded = JSON.stringify(request);
		if (encoded === undefined) throw new Error("not serializable");
		return encoded;
	} catch {
		throw new ProtocolValidationError("Command request is not serializable");
	}
}
