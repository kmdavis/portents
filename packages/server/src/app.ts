import { createHash, randomUUID } from "node:crypto";
import {
	defaultRandomSource,
	assertValidKey,
	deckSize,
	executeCampaignCommand,
	IdempotencyConflictError,
	parseDocument,
	pileMatchesDeck,
	type Pile,
	type JsonValue,
	readCampaignRevision,
	sheetProblems,
	StorageError,
	StaleCampaignRevisionError,
	type Storage,
	type StorageKey,
	type StorageTransaction,
	type TransactionalStorage,
} from "@portents/core";
import { MemoryStorage } from "@portents/core/memory";
import {
	authenticateBearer,
	LocalCredentialProvider,
	requireOwnedCampaign,
	ResourceUnavailableError,
	UnauthenticatedError,
	type CampaignOwnership,
	type Principal,
} from "@portents/identity";
import { commonContent } from "@portents/content";
import { Hono } from "hono";
import { executeCommand, normalizeProtocolError, WebSession, type CampaignIdentityMap } from "@portents/web";
import {
	parseCommandRequest,
	parseCommandResponse,
	PROTOCOL_VERSION,
	ProtocolValidationError,
	type Command,
	type CommandRequest,
	type CommandResponse,
	type CommandResult,
	type ProtocolError,
} from "@portents/web";
import {
	CampaignArchiveError,
	exportCampaignArchive,
	importCampaignArchive,
	MAX_ARCHIVE_BYTES,
	parseCampaignArchive,
	contentPackVersion,
	type CampaignArchiveV1,
} from "./archive.ts";
import { SqliteStorage } from "./sqlite-storage.ts";

function serverSession(storage: Storage): WebSession {
	return new WebSession({ storage, random: defaultRandomSource() });
}

const campaignMetadata = (id: string, field: "owner" | "slug") => assertValidKey(`server/campaigns/${id}/${field}`);
const ownerIndexPrefix = (principalId: string) => `server/owners/${principalId}/`;
const archivePackVersions = commonContent.map(contentPackVersion).sort((left, right) =>
	left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
);

export interface ServerCommandOutcome {
	readonly result: CommandResult;
	readonly revision?: number;
}

function requireOpaqueSegment(value: string, label: string): string {
	if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
		throw new ProtocolValidationError(`${label} is invalid`, "INVALID_INPUT");
	}
	return value;
}

function campaignRoot(campaignId: string): StorageKey {
	return assertValidKey(`campaigns/${requireOpaqueSegment(campaignId, "Campaign ID")}`);
}

function requireIdempotencyKey(request: CommandRequest): string {
	const key = request.idempotencyKey;
	if (key === undefined || !/^[A-Za-z0-9_-]{1,128}$/.test(key)) {
		throw new ProtocolValidationError("Mutating commands require an idempotency key containing only letters, digits, _ or - (max 128 characters)");
	}
	return key;
}

function fingerprint(request: CommandRequest): string {
	const canonical = (value: unknown): unknown => {
		if (Array.isArray(value)) return value.map(canonical);
		if (typeof value !== "object" || value === null) return value;
		return Object.fromEntries(
			Object.entries(value)
				.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
				.map(([key, child]) => [key, canonical(child)]),
		);
	};
	return createHash("sha256").update(JSON.stringify({ version: request.version, command: canonical(request.command) })).digest("hex");
}

const MAX_REQUEST_BYTES = 1024 * 1024;
class PayloadTooLargeError extends Error {}

async function readRequestBody(request: Request, maxBytes = MAX_REQUEST_BYTES): Promise<unknown> {
	const declaredLength = request.headers.get("content-length");
	if (declaredLength !== null && Number(declaredLength) > maxBytes) throw new PayloadTooLargeError();
	if (!request.body) throw new ProtocolValidationError("Request body must be valid JSON");
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > maxBytes) {
				await reader.cancel();
				throw new PayloadTooLargeError();
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return JSON.parse(new TextDecoder().decode(bytes));
}

function enforceCommandBounds(request: CommandRequest): void {
	const command = request.command;
	if ("expression" in command && command.expression.length > 4096) throw new ProtocolValidationError("Dice expression exceeds the 4096-character server limit");
	if (command.type === "map.generate" && (command.rooms ?? 20) > 100) throw new ProtocolValidationError("Map generation is limited to 100 rooms per command");
	if (command.type === "deck.draw" && (command.count ?? 1) > 50) throw new ProtocolValidationError("Deck draws are limited to 50 cards per command");
	if (command.type === "map.moveActor" && (command.actors.length > 256 || (command.explored?.length ?? 0) > 10_000)) {
		throw new ProtocolValidationError("Map movement is limited to 256 actors and 10000 explored cells per command");
	}
}

function campaignStorage(storage: Storage, root: StorageKey, readOnly = false): Storage {
	const keyFor = (key: StorageKey): StorageKey => {
		if (!key.startsWith("campaigns/") || key === "campaigns/") {
			throw new TypeError("Campaign storage view cannot access a key outside campaigns/");
		}
		return assertValidKey(`${root}/${key}`);
	};
	const prefixFor = (prefix: string): string => {
		if (!prefix.startsWith("campaigns/")) throw new TypeError("Campaign storage view cannot list outside campaigns/");
		return `${root}/${prefix}`;
	};
	return {
		read: (key) => storage.read(keyFor(key)),
		write: async (key, contents) => {
			if (readOnly) throw new TypeError("Read-only campaign view cannot write");
			await storage.write(keyFor(key), contents);
		},
		append: async (key, contents) => {
			if (readOnly) throw new TypeError("Read-only campaign view cannot append");
			await storage.append(keyFor(key), contents);
		},
		exists: (key) => storage.exists(keyFor(key)),
		list: async (prefix) => {
			const rootPrefix = `${root}/`;
			return (await storage.list(prefixFor(prefix))).map((key) => key.slice(rootPrefix.length) as StorageKey);
		},
		remove: async (key) => {
			if (readOnly) throw new TypeError("Read-only campaign view cannot remove");
			await storage.remove(keyFor(key));
		},
	};
}

class TransactionCampaignOwnership implements CampaignOwnership {
	readonly #transaction: Pick<StorageTransaction, "read" | "list">;
	constructor(transaction: Pick<StorageTransaction, "read" | "list">) {
		this.#transaction = transaction;
	}
	async listOwnedCampaignIds(principalId: string): Promise<readonly string[]> {
		const prefix = ownerIndexPrefix(requireOpaqueSegment(principalId, "Principal ID"));
		return (await this.#transaction.list(prefix)).map((key) => key.slice(prefix.length));
	}
	async findCampaignOwner(campaignId: string): Promise<string | null> {
		const value = await this.#transaction.read(campaignMetadata(requireOpaqueSegment(campaignId, "Campaign ID"), "owner"));
		return value ?? null;
	}
}

async function campaignSlug(transaction: Pick<StorageTransaction, "read">, campaignId: string): Promise<string> {
	const slug = await transaction.read(campaignMetadata(campaignId, "slug"));
	if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new ResourceUnavailableError();
	return slug;
}

function identityMap(campaignId: string, slug: string): CampaignIdentityMap {
	return {
		toSlug: (id) => {
			if (id !== campaignId) throw new ResourceUnavailableError();
			return slug;
		},
		toId: () => campaignId,
	};
}

function campaignMutation(command: Command): boolean {
	switch (command.type) {
		case "campaign.journal":
		case "campaign.scene":
		case "campaign.setting":
		case "campaign.system":
		case "campaign.clock":
		case "sheet.create":
		case "sheet.setMain":
		case "sheet.patchStatus":
		case "sheet.setSection":
		case "sheet.appendSection":
		case "remember":
			return true;
		case "campaign.world":
			return command.body !== undefined;
		case "dice.roll":
		case "deck.draw":
		case "table.roll":
		case "oracle.answer":
			return command.campaignId !== undefined;
		default:
			return false;
	}
}

function validateMetadata(request: CommandRequest, kind: "create" | "campaign-mutation" | "read"): void {
	if (kind === "create") {
		if (request.expectedRevision !== undefined) throw new ProtocolValidationError("Campaign creation does not use an expected revision");
		requireIdempotencyKey(request);
		return;
	}
	if (kind === "campaign-mutation") {
		if (request.expectedRevision === undefined || !Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0) {
			throw new ProtocolValidationError("Mutating campaign commands require a non-negative expectedRevision");
		}
		requireIdempotencyKey(request);
		return;
	}
	if (request.expectedRevision !== undefined || request.idempotencyKey !== undefined) {
		throw new ProtocolValidationError("Read-only commands do not accept revision or idempotency metadata");
	}
}

function parseCreateReplay(value: string, expectedFingerprint: string, key: string): { readonly campaignId: string; readonly result: CommandResult } {
	let replay: unknown;
	try {
		replay = JSON.parse(value);
	} catch {
		throw new StorageError("Campaign creation replay record is corrupt", assertValidKey("server/create-replays"));
	}
	if (typeof replay !== "object" || replay === null || !("version" in replay) || replay.version !== 1 ||
		!("fingerprint" in replay) || typeof replay.fingerprint !== "string" ||
		!("campaignId" in replay) || typeof replay.campaignId !== "string" || !("result" in replay)) {
		throw new StorageError("Campaign creation replay record is corrupt", assertValidKey("server/create-replays"));
	}
	if (replay.fingerprint !== expectedFingerprint) throw new IdempotencyConflictError(key);
	try {
		const response = parseCommandResponse({ version: PROTOCOL_VERSION, result: replay.result, revision: 0 });
		if (response.result === undefined) throw new Error("missing result");
		return { campaignId: requireOpaqueSegment(replay.campaignId, "Campaign ID"), result: response.result };
	} catch {
		throw new StorageError("Campaign creation replay result is corrupt", assertValidKey("server/create-replays"));
	}
}

async function createCampaign(storage: SqliteStorage, principal: Principal, request: CommandRequest): Promise<ServerCommandOutcome> {
	validateMetadata(request, "create");
	const key = requireIdempotencyKey(request);
	const replayKey = assertValidKey(`server/create-replays/${requireOpaqueSegment(principal.id, "Principal ID")}/${key}`);
	const commandFingerprint = fingerprint(request);
	return storage.transaction(async (transaction) => {
		const stored = await transaction.read(replayKey);
		if (stored !== undefined) {
			const replay = parseCreateReplay(stored, commandFingerprint, key);
			const owner = await transaction.read(campaignMetadata(replay.campaignId, "owner"));
			if (owner !== principal.id) throw new ResourceUnavailableError();
			return { result: replay.result, revision: 0 };
		}
		const campaignId = randomUUID();
		const root = campaignRoot(campaignId);
		const session = serverSession(campaignStorage(transaction, root));
		const result = await executeCommand(session, request, { campaignIdentity: identityMap(campaignId, "") });
		const created = result.type === "campaigns" ? result.campaigns[0] : undefined;
		if (!created || created.id !== campaignId || !session.campaign) {
			throw new StorageError("Campaign creation identity mapping failed", root);
		}
		const slug = session.campaign.slug;
		await transaction.write(campaignMetadata(campaignId, "owner"), principal.id);
		await transaction.write(campaignMetadata(campaignId, "slug"), slug);
		await transaction.write(assertValidKey(`${ownerIndexPrefix(principal.id)}${campaignId}`), "1");
		await transaction.write(replayKey, JSON.stringify({ version: 1, fingerprint: commandFingerprint, campaignId, result }));
		return { result, revision: 0 };
	});
}

async function listCampaigns(storage: TransactionalStorage, principal: Principal): Promise<ServerCommandOutcome> {
	return storage.transaction(async (transaction) => {
		const ownership = new TransactionCampaignOwnership(transaction);
		const ids = await ownership.listOwnedCampaignIds(principal.id);
		const campaigns: { id: string; name: string; system: string }[] = [];
		for (const id of ids) {
			const campaignId = requireOpaqueSegment(id, "Campaign ID");
			await requireOwnedCampaign(principal, campaignId, ownership);
			const slug = await campaignSlug(transaction, campaignId);
			const session = new WebSession({ storage: campaignStorage(transaction, campaignRoot(campaignId), true) });
			const campaign = await session.loadCampaign(slug);
			campaigns.push({ id: campaignId, name: campaign.name, system: campaign.systemLine });
		}
		return { result: { type: "campaigns", campaigns } };
	});
}

async function executeCampaignRead(
	storage: TransactionalStorage,
	principal: Principal,
	request: CommandRequest,
	campaignId: string,
): Promise<ServerCommandOutcome> {
	validateMetadata(request, "read");
	const id = requireOpaqueSegment(campaignId, "Campaign ID");
	const root = campaignRoot(id);
	return storage.transaction(async (transaction) => {
		await requireOwnedCampaign(principal, id, new TransactionCampaignOwnership(transaction));
		const slug = await campaignSlug(transaction, id);
		const revision = await readCampaignRevision(transaction, root);
		const session = serverSession(campaignStorage(transaction, root, true));
		const result = await executeCommand(session, request, { campaignIdentity: identityMap(id, slug) });
		return { result, revision };
	});
}

async function executeCampaignMutation(
	storage: TransactionalStorage,
	principal: Principal,
	request: CommandRequest,
	campaignId: string,
): Promise<ServerCommandOutcome> {
	validateMetadata(request, "campaign-mutation");
	const id = requireOpaqueSegment(campaignId, "Campaign ID");
	const root = campaignRoot(id);
	let slug = "";
	const receipt = await executeCampaignCommand<JsonValue>(storage, {
		campaignRoot: root,
		principalId: principal.id,
		expectedRevision: request.expectedRevision!,
		idempotencyKey: requireIdempotencyKey(request),
		requestFingerprint: fingerprint(request),
		authorize: async (view) => {
			await requireOwnedCampaign(principal, id, new TransactionCampaignOwnership(view));
			slug = await campaignSlug(view, id);
		},
		execute: async (transaction) => {
			const session = serverSession(campaignStorage(transaction, root));
			return (await executeCommand(session, request, { campaignIdentity: identityMap(id, slug) })) as unknown as JsonValue;
		},
	});
	return { result: receipt.result as CommandResult, revision: receipt.revision };
}

async function executeAuthenticatedCommand(storage: SqliteStorage, principal: Principal, request: CommandRequest): Promise<ServerCommandOutcome> {
	const command = request.command;
	if (command.type === "campaign.create") return createCampaign(storage, principal, request);
	if (command.type === "campaign.list") {
		validateMetadata(request, "read");
		return listCampaigns(storage, principal);
	}
	if ("campaignId" in command && command.campaignId !== undefined) {
		return campaignMutation(command)
			? executeCampaignMutation(storage, principal, request, command.campaignId)
			: executeCampaignRead(storage, principal, request, command.campaignId);
	}
	validateMetadata(request, "read");
	const session = serverSession(new MemoryStorage());
	return { result: await executeCommand(session, request) };
}

function protocolFailure(error: unknown): { readonly error: ProtocolError; readonly status: 400 | 401 | 403 | 404 | 409 | 500 } {
	if (error instanceof UnauthenticatedError) return { error: { code: "UNAUTHENTICATED", message: "Authentication is required" }, status: 401 };
	if (error instanceof ResourceUnavailableError) return { error: { code: "NOT_FOUND", message: "The requested resource is unavailable" }, status: 404 };
	if (error instanceof StaleCampaignRevisionError) return { error: { code: "STALE_REVISION", message: error.message }, status: 409 };
	if (error instanceof IdempotencyConflictError) return { error: { code: "IDEMPOTENCY_CONFLICT", message: error.message }, status: 409 };
	if (error instanceof SyntaxError) return { error: { code: "INVALID_INPUT", message: "Request body must be valid JSON" }, status: 400 };
	const protocolError = normalizeProtocolError(error);
	const status = protocolError.code === "UNAUTHENTICATED" ? 401
		: protocolError.code === "UNAUTHORIZED" ? 403
			: protocolError.code === "NOT_FOUND" ? 404
				: protocolError.code === "STALE_REVISION" || protocolError.code === "IDEMPOTENCY_CONFLICT" ? 409
					: protocolError.code === "STORAGE_FAILURE" || protocolError.code === "INTERNAL_ERROR" ? 500 : 400;
	return {
		error: {
			code: protocolError.code,
			message: protocolError.message,
			...(protocolError.details ? { details: protocolError.details } : {}),
		},
		status,
	};
}

function requireArchiveIdempotencyKey(value: string | undefined): string {
	if (!value || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
		throw new ProtocolValidationError("Campaign archive imports require a valid Idempotency-Key header");
	}
	return value;
}

function requireCompatibleArchivePacks(archive: CampaignArchiveV1): void {
	if (archive.packVersions.length !== archivePackVersions.length ||
		archive.packVersions.some((required, index) => {
			const installed = archivePackVersions[index];
			return required.id !== installed?.id || required.version !== installed.version;
		})) {
		throw new ProtocolValidationError("Campaign archive requires unavailable or incompatible content packs");
	}
}

function parseArchiveImportReplay(value: string): { readonly version: 1; readonly fingerprint: string; readonly campaignId: string } {
	let replay: unknown;
	try {
		replay = JSON.parse(value);
	} catch {
		throw new StorageError("Campaign archive import replay is corrupt", assertValidKey("server/archive-imports"));
	}
	if (typeof replay !== "object" || replay === null ||
		!("version" in replay) || replay.version !== 1 ||
		!("fingerprint" in replay) || typeof replay.fingerprint !== "string" ||
		!("campaignId" in replay) || typeof replay.campaignId !== "string") {
		throw new StorageError("Campaign archive import replay is corrupt", assertValidKey("server/archive-imports"));
	}
	return {
		version: 1,
		fingerprint: replay.fingerprint,
		campaignId: requireOpaqueSegment(replay.campaignId, "Campaign ID"),
	};
}

function archiveRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidCampaignArchiveData(): never {
	throw new ProtocolValidationError("Campaign archive contains invalid campaign data");
}

async function validateCampaignArchiveData(storage: Storage, slug: string): Promise<void> {
	try {
		const overviewText = await storage.read(`campaigns/${slug}/campaign.md`);
		if (overviewText === undefined) invalidCampaignArchiveData();
		const overview = parseDocument(overviewText);
		const session = serverSession(storage);
		const campaign = await session.loadCampaign(slug);
		if (typeof overview.data.name !== "string" || !overview.data.name.trim() ||
			overview.data.slug !== slug || typeof overview.data.system !== "string" || !overview.data.system.trim()) {
			invalidCampaignArchiveData();
		}
		const counters = overview.data.counters;
		if (!archiveRecord(counters) ||
			!["sessions", "rolls", "draws"].every((key) => {
				const value = counters[key];
				return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
			})) invalidCampaignArchiveData();
		const pending = overview.data.pendingRoll;
		if (pending !== undefined) {
			if (!archiveRecord(pending)) invalidCampaignArchiveData();
			const fields = Object.keys(pending);
			if (fields.length > 0 && (
				typeof pending.expression !== "string" || !pending.expression.trim() ||
				typeof pending.reason !== "string" ||
				typeof pending.requestedAt !== "string" || Number.isNaN(Date.parse(pending.requestedAt)) ||
				(pending.kind !== undefined && typeof pending.kind !== "string") ||
				(pending.dc !== undefined && (typeof pending.dc !== "number" || !Number.isFinite(pending.dc)))
			)) invalidCampaignArchiveData();
		}

		if (!(await session.listCampaigns()).some((summary) => summary.slug === slug)) invalidCampaignArchiveData();
		if (campaign.ledger.problems().length > 0) invalidCampaignArchiveData();
		void campaign.clocks;
		if (campaign.settingId && !session.registry.setting(campaign.settingId)) invalidCampaignArchiveData();

		for (const name of await campaign.listCharacters()) {
			const sheet = await campaign.readCharacter(name);
			if (!sheet || typeof sheet.data.name !== "string" || campaign.keys.character(sheet.data.name) !== campaign.keys.character(name) ||
				sheetProblems(sheet).length > 0) invalidCampaignArchiveData();
		}
		if (campaign.activeCharacter && !(await campaign.readCharacter(campaign.activeCharacter))) invalidCampaignArchiveData();
		for (const record of await campaign.listResources()) {
			const kind = record.path.split("/")[0];
			if (record.resource.kind !== kind || record.resource.settingId !== undefined ||
				!record.resource.id.startsWith(`campaign/${slug}/`)) invalidCampaignArchiveData();
		}

		const pilesText = await storage.read(campaign.keys.piles);
		if (pilesText !== undefined) {
			const piles: unknown = JSON.parse(pilesText);
			if (!archiveRecord(piles)) invalidCampaignArchiveData();
			for (const [deckId, value] of Object.entries(piles)) {
				if (!archiveRecord(value) || !Array.isArray(value.draw) || !Array.isArray(value.discard) ||
					(value.shuffledAt !== undefined && typeof value.shuffledAt !== "string")) invalidCampaignArchiveData();
				const deck = session.registry.deck(deckId);
				if (!deck) invalidCampaignArchiveData();
				const pile = value as unknown as Pile;
				const size = deckSize(deck);
				const indices = [...pile.draw, ...pile.discard];
				if (!pileMatchesDeck(deck, pile) || indices.some((index) =>
					!Number.isSafeInteger(index) || index < 0 || index >= size) ||
					new Set(indices).size !== size) invalidCampaignArchiveData();
			}
		}
	} catch (error) {
		if (error instanceof ProtocolValidationError || error instanceof StorageError) throw error;
		invalidCampaignArchiveData();
	}
}

async function importArchiveForPrincipal(
	storage: SqliteStorage,
	principal: Principal,
	archive: CampaignArchiveV1,
	idempotencyKey: string,
): Promise<{ readonly campaignId: string; readonly replayed: boolean }> {
	const principalId = requireOpaqueSegment(principal.id, "Principal ID");
	const replayKey = assertValidKey(`server/archive-imports/${principalId}/${idempotencyKey}`);
	return storage.transaction(async (transaction) => {
		const stored = await transaction.read(replayKey);
		if (stored !== undefined) {
			const replay = parseArchiveImportReplay(stored);
			if (replay.fingerprint !== archive.sha256) throw new IdempotencyConflictError(idempotencyKey);
			if (await transaction.read(campaignMetadata(replay.campaignId, "owner")) !== principalId) {
				throw new ResourceUnavailableError();
			}
			return { campaignId: replay.campaignId, replayed: true };
		}

		const campaignId = randomUUID();
		const root = campaignRoot(campaignId);
		if (await transaction.exists(campaignMetadata(campaignId, "owner")) ||
			await transaction.exists(campaignMetadata(campaignId, "slug")) ||
			(await transaction.list(`${root}/`)).length > 0 ||
			await readCampaignRevision(transaction, root) !== 0) {
			throw new StorageError("Campaign archive identity collision", root);
		}

		await importCampaignArchive(archive, campaignStorage(transaction, root));
		await validateCampaignArchiveData(campaignStorage(transaction, root, true), archive.campaignSlug);
		await transaction.write(campaignMetadata(campaignId, "owner"), principalId);
		await transaction.write(campaignMetadata(campaignId, "slug"), archive.campaignSlug);
		await transaction.write(assertValidKey(`${ownerIndexPrefix(principalId)}${campaignId}`), "1");
		await transaction.write(replayKey, JSON.stringify({
			version: 1,
			fingerprint: archive.sha256,
			campaignId,
		}));
		return { campaignId, replayed: false };
	});
}

/** Create the authenticated HTTP API shared by local and self-hosted Node servers. */
export function createServerApp(storage: SqliteStorage): Hono {
	const credentials = new LocalCredentialProvider(storage);
	const app = new Hono();
	let admittedRequests = 0;
	let admittedArchiveTransfers = 0;
	const maxAdmittedRequests = 64;
	const maxAdmittedArchiveTransfers = 1;
	app.post("/api/commands", async (context) => {
		let admitted = false;
		try {
			const principal = await authenticateBearer(context.req.header("authorization"), credentials, []);
			if (admittedRequests >= maxAdmittedRequests) {
				return context.json({
					version: PROTOCOL_VERSION,
					error: { code: "SERVER_BUSY", message: "The server is at capacity; retry the request" },
				} satisfies CommandResponse, 503);
			}
			admittedRequests++;
			admitted = true;
			const contentType = context.req.header("content-type")?.split(";")[0]?.trim().toLowerCase();
			if (contentType !== "application/json") throw new ProtocolValidationError("Content-Type must be application/json");
			const request = parseCommandRequest(await readRequestBody(context.req.raw));
			enforceCommandBounds(request);
			const outcome = await executeAuthenticatedCommand(storage, principal, request);
			return context.json({ version: PROTOCOL_VERSION, result: outcome.result, ...(outcome.revision === undefined ? {} : { revision: outcome.revision }) } satisfies CommandResponse);
		} catch (error) {
			if (error instanceof PayloadTooLargeError) {
				return context.json({ version: PROTOCOL_VERSION, error: { code: "PAYLOAD_TOO_LARGE", message: `Request body exceeds ${MAX_REQUEST_BYTES} bytes` } }, 413);
			}
			const failure = protocolFailure(error);
			return context.json({ version: PROTOCOL_VERSION, error: failure.error } satisfies CommandResponse, failure.status);
		} finally {
			if (admitted) admittedRequests--;
		}
	});
	app.get("/api/campaigns/:campaignId/archive", async (context) => {
		let admitted = false;
		try {
			const principal = await authenticateBearer(context.req.header("authorization"), credentials, []);
			if (admittedRequests >= maxAdmittedRequests || admittedArchiveTransfers >= maxAdmittedArchiveTransfers) {
				return context.json({
					version: PROTOCOL_VERSION,
					error: { code: "SERVER_BUSY", message: "The server is at capacity; retry the request" },
				} satisfies CommandResponse, 503);
			}
			admittedRequests++;
			admittedArchiveTransfers++;
			admitted = true;
			const campaignId = requireOpaqueSegment(context.req.param("campaignId"), "Campaign ID");
			const archive = await storage.transaction(async (transaction) => {
				await requireOwnedCampaign(principal, campaignId, new TransactionCampaignOwnership(transaction));
				const slug = await campaignSlug(transaction, campaignId);
				return exportCampaignArchive(campaignStorage(transaction, campaignRoot(campaignId), true), slug, archivePackVersions);
			});
			return context.json(archive);
		} catch (error) {
			if (error instanceof CampaignArchiveError && error.code === "ARCHIVE_TOO_LARGE") {
				return context.json({ version: PROTOCOL_VERSION, error: { code: "PAYLOAD_TOO_LARGE", message: "Campaign archive exceeds the 64 MiB limit" } }, 413);
			}
			const failure = protocolFailure(error);
			return context.json({ version: PROTOCOL_VERSION, error: failure.error } satisfies CommandResponse, failure.status);
		} finally {
			if (admitted) {
				admittedRequests--;
				admittedArchiveTransfers--;
			}
		}
	});
	app.post("/api/campaigns/import", async (context) => {
		let admitted = false;
		try {
			const principal = await authenticateBearer(context.req.header("authorization"), credentials, []);
			if (admittedRequests >= maxAdmittedRequests || admittedArchiveTransfers >= maxAdmittedArchiveTransfers) {
				return context.json({
					version: PROTOCOL_VERSION,
					error: { code: "SERVER_BUSY", message: "The server is at capacity; retry the request" },
				} satisfies CommandResponse, 503);
			}
			admittedRequests++;
			admittedArchiveTransfers++;
			admitted = true;
			const contentType = context.req.header("content-type")?.split(";")[0]?.trim().toLowerCase();
			if (contentType !== "application/json") throw new ProtocolValidationError("Content-Type must be application/json");
			const idempotencyKey = requireArchiveIdempotencyKey(context.req.header("idempotency-key"));
			let archive: CampaignArchiveV1;
			try {
				archive = parseCampaignArchive(await readRequestBody(context.req.raw, MAX_ARCHIVE_BYTES));
			} catch (error) {
				if (error instanceof CampaignArchiveError) {
					if (error.code === "ARCHIVE_TOO_LARGE") throw error;
					throw new ProtocolValidationError("Campaign archive is invalid");
				}
				throw error;
			}
			requireCompatibleArchivePacks(archive);
			const imported = await importArchiveForPrincipal(storage, principal, archive, idempotencyKey);
			return context.json(
				{ campaignId: imported.campaignId, slug: archive.campaignSlug },
				imported.replayed ? 200 : 201,
			);
		} catch (error) {
			if (error instanceof PayloadTooLargeError || error instanceof CampaignArchiveError && error.code === "ARCHIVE_TOO_LARGE") {
				return context.json({ version: PROTOCOL_VERSION, error: { code: "PAYLOAD_TOO_LARGE", message: "Campaign archive exceeds the 64 MiB limit" } }, 413);
			}
			const failure = protocolFailure(error);
			return context.json({ version: PROTOCOL_VERSION, error: failure.error } satisfies CommandResponse, failure.status);
		} finally {
			if (admitted) {
				admittedRequests--;
				admittedArchiveTransfers--;
			}
		}
	});
	app.onError((error, context) => {
		const failure = protocolFailure(error);
		return context.json({ version: PROTOCOL_VERSION, error: failure.error } satisfies CommandResponse, failure.status);
	});
	return app;
}
