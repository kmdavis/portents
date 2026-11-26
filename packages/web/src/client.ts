import {
	isProtocolActor,
	isProtocolJsonValue,
	isProtocolRecord,
	isProtocolTileSource,
	PROTOCOL_ERROR_CODES,
	ProtocolValidationError,
	PROTOCOL_VERSION,
	serializeCommandRequest,
	type Command,
	type CommandResponse,
	type CommandResult,
	type ProtocolError,
	type ProtocolErrorCode,
} from "./protocol.ts";

export class ProtocolCommandError extends Error {
	readonly code: ProtocolErrorCode;
	readonly details: ProtocolError["details"];

	constructor(error: ProtocolError) {
		super(error.message);
		this.name = "ProtocolCommandError";
		this.code = error.code;
		this.details = error.details;
	}
}


function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function isIndexArray(value: unknown): boolean {
	return Array.isArray(value) && value.every((item) => Number.isInteger(item) && Number.isFinite(item) && item >= 0);
}

function isLedger(value: unknown): boolean {
	return Array.isArray(value) && value.every((entry) =>
		isProtocolRecord(entry) && typeof entry.id === "string" && typeof entry.kind === "string" &&
		Object.keys(entry).every((key) => key === "id" || key === "kind"));
}

function isResult(value: unknown): value is CommandResult {
	if (!isProtocolRecord(value) || typeof value.type !== "string") return false;
	switch (value.type) {
		case "text":
			return typeof value.text === "string" &&
				(value.ledger === undefined || isLedger(value.ledger)) &&
				Object.keys(value).every((key) => key === "type" || key === "text" || key === "ledger");
		case "roll":
			return isStringArray(value.lines) && Array.isArray(value.totals) && value.totals.every((item) => typeof item === "number" && Number.isFinite(item)) && isLedger(value.ledger) &&
				Object.keys(value).every((key) => key === "type" || key === "lines" || key === "totals" || key === "ledger");
		case "map":
			return typeof value.ascii === "string" && typeof value.svg === "string" && typeof value.seed === "string" &&
				Object.keys(value).every((key) => key === "type" || key === "ascii" || key === "svg" || key === "seed");
		case "map-view":
			return isProtocolTileSource(value.tile) && Array.isArray(value.actors) && value.actors.every(isProtocolActor) &&
				isIndexArray(value.explored) && isIndexArray(value.visible) &&
				(value.sightRadius === undefined || (typeof value.sightRadius === "number" && Number.isFinite(value.sightRadius) && value.sightRadius >= 0)) &&
				Object.keys(value).every((key) => ["type", "tile", "actors", "explored", "visible", "sightRadius"].includes(key));
		case "campaigns":
			return Array.isArray(value.campaigns) && value.campaigns.every((campaign) =>
				isProtocolRecord(campaign) && typeof campaign.id === "string" && typeof campaign.name === "string" &&
				(campaign.system === undefined || typeof campaign.system === "string") &&
				Object.keys(campaign).every((key) => key === "id" || key === "name" || key === "system")) &&
				Object.keys(value).every((key) => key === "type" || key === "campaigns");
		case "catalog":
			return isStringArray(value.ids) && Object.keys(value).every((key) => key === "type" || key === "ids");
		case "clock":
			return typeof value.name === "string" && typeof value.filled === "number" && Number.isFinite(value.filled) &&
				typeof value.segments === "number" && Number.isFinite(value.segments) &&
				Object.keys(value).every((key) => key === "type" || key === "name" || key === "filled" || key === "segments");
		case "remembered":
			return typeof value.id === "string" && typeof value.name === "string" && typeof value.path === "string" &&
				Object.keys(value).every((key) => key === "type" || key === "id" || key === "name" || key === "path");
		case "empty":
			return Object.keys(value).length === 1;
		default:
			return false;
	}
}

/** Validate a reply from an HTTP or other transport binding. */
export function parseCommandResponse(value: unknown): CommandResponse {
	if (!isProtocolJsonValue(value)) throw new ProtocolValidationError("Response must contain only JSON values");
	if (!isProtocolRecord(value) || !Number.isInteger(value.version) || value.version !== PROTOCOL_VERSION) {
		throw new ProtocolValidationError("Unsupported or invalid protocol response version", "UNSUPPORTED_VERSION");
	}
	if (Object.keys(value).some((key) => key !== "version" && key !== "result" && key !== "error")) {
		throw new ProtocolValidationError("Response contains an unknown field");
	}
	if ((value.result === undefined) === (value.error === undefined)) {
		throw new ProtocolValidationError("Response must contain exactly one result or error");
	}
	if (value.result !== undefined) {
		if (!isResult(value.result)) throw new ProtocolValidationError("Response result does not match the protocol schema");
	} else {
		const error = value.error;
		if (!isProtocolRecord(error) || !PROTOCOL_ERROR_CODES.includes(error.code as ProtocolErrorCode) || typeof error.message !== "string" ||
			(error.details !== undefined && !isProtocolRecord(error.details)) ||
			Object.keys(error).some((key) => key !== "code" && key !== "message" && key !== "details")) {
			throw new ProtocolValidationError("Response error does not match the protocol schema");
		}
	}
	return value as unknown as CommandResponse;
}

/** A typed client over a transport that accepts a JSON request body. */
export function createCommandClient(transport: (body: string) => Promise<unknown>) {
	return {
		async execute(command: Command): Promise<CommandResult> {
			const response = parseCommandResponse(await transport(serializeCommandRequest({
				version: PROTOCOL_VERSION,
				command,
			})));
			if (response.error !== undefined) throw new ProtocolCommandError(response.error);
			if (response.result === undefined) throw new ProtocolValidationError("Protocol response has no result");
			return response.result;
		},
	};
}
