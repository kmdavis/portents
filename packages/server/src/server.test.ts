import assert from "node:assert/strict";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { LocalCredentialProvider } from "@portents/identity";
import { MemoryStorage } from "@portents/core/memory";
import { InvalidKeyError, StorageError, StorageUnavailableError } from "@portents/core";
import { PROTOCOL_VERSION, WebSession, type CommandResponse } from "@portents/web";
import { createServerApp } from "./app.ts";
import { DATABASE_FILENAME, installLocalServer, startServer } from "./runtime.ts";
import { SqliteStorage } from "./sqlite-storage.ts";

const directories: string[] = [];
function temporaryDirectory(): string {
	const directory = mkdtempSync(join(tmpdir(), "portents-server-"));
	directories.push(directory);
	return directory;
}
after(() => { for (const directory of directories) rmSync(directory, { recursive: true, force: true }); });

async function postCommand(app: ReturnType<typeof createServerApp>, credential: string | undefined, command: unknown, metadata: object = {}) {
	const headers = new Headers({ "content-type": "application/json" });
	if (credential !== undefined) headers.set("authorization", `Bearer ${credential}`);
	const response = await app.request("/api/commands", {
		method: "POST",
		headers,
		body: JSON.stringify({ version: PROTOCOL_VERSION, command, ...metadata }),
	});
	return { status: response.status, body: await response.json() as CommandResponse };
}

async function fetchCommand(endpoint: string, credential: string, command: unknown, metadata: object = {}) {
	const response = await fetch(`${endpoint}/api/commands`, {
		method: "POST",
		headers: { authorization: `Bearer ${credential}`, "content-type": "application/json" },
		body: JSON.stringify({ version: PROTOCOL_VERSION, command, ...metadata }),
	});
	return { status: response.status, body: await response.json() as CommandResponse };
}

async function availablePort(): Promise<number> {
	const probe = createServer();
	await new Promise<void>((resolve, reject) => {
		probe.once("error", reject);
		probe.listen(0, "127.0.0.1", resolve);
	});
	const address = probe.address();
	if (!address || typeof address === "string") throw new Error("Could not allocate a test port");
	await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
	return address.port;
}

describe("local and self-hosted command server", () => {
	it("requires credentials, scopes campaigns, and applies revision/idempotency checks", async () => {
		const directory = temporaryDirectory();
		const databasePath = join(directory, DATABASE_FILENAME);
		const storage = new SqliteStorage(databasePath);
		let campaignId: string;
		let ownerCredential = "";
		try {
			const provider = new LocalCredentialProvider(storage);
			const owner = await provider.issue("local-owner");
			ownerCredential = owner.credential;
			const stranger = await provider.issue("local-stranger");
			const app = createServerApp(storage);

			const unauthenticated = await postCommand(app, undefined, { type: "campaign.list" });
			assert.equal(unauthenticated.status, 401);
			assert.equal(unauthenticated.body.error?.code, "UNAUTHENTICATED");

			const createRequest = { type: "campaign.create", name: "Greywater", system: "5e" };
			const firstCreate = await postCommand(app, owner.credential, createRequest, { idempotencyKey: "create-1" });
			assert.equal(firstCreate.status, 200);
			assert.equal(firstCreate.body.result?.type, "campaigns");
			if (firstCreate.body.result?.type !== "campaigns") throw new Error("campaign.create returned no campaign");
			campaignId = firstCreate.body.result.campaigns[0]!.id;
			const replayedCreate = await postCommand(app, owner.credential, createRequest, { idempotencyKey: "create-1" });
			assert.equal(replayedCreate.body.result?.type, "campaigns");
			if (replayedCreate.body.result?.type !== "campaigns") throw new Error("campaign.create replay returned no campaign");
			assert.equal(replayedCreate.body.result.campaigns[0]!.id, campaignId);

			const update = { type: "campaign.journal", campaignId, heading: "Opening", body: "The rain begins." };
			const firstUpdate = await postCommand(app, owner.credential, update, { expectedRevision: 0, idempotencyKey: "update-1" });
			assert.equal(firstUpdate.status, 200);
			assert.equal(firstUpdate.body.revision, 1);
			const replayedUpdate = await postCommand(app, owner.credential, update, { expectedRevision: 0, idempotencyKey: "update-1" });
			assert.equal(replayedUpdate.status, 200);
			assert.equal(replayedUpdate.body.revision, 1);
			const journal = await storage.read(`campaigns/${campaignId}/campaigns/greywater/journal.md`);
			assert.equal((journal?.match(/## Opening/g) ?? []).length, 1);
			const deckId = new WebSession({ storage: new MemoryStorage(), seed: "server-deck-catalog" }).deckIds()[0];
			assert.ok(deckId);
			const draw = await postCommand(app, owner.credential, {
				type: "deck.draw", campaignId, deckId,
			}, { expectedRevision: 1, idempotencyKey: "draw-1" });
			assert.equal(draw.status, 200);
			assert.equal(draw.body.result?.type, "text");
			assert.equal(draw.body.revision, 2);

			const conflict = await postCommand(app, owner.credential, {
				type: "campaign.scene", campaignId, summary: "Different request",
			}, { expectedRevision: 0, idempotencyKey: "update-1" });
			assert.equal(conflict.status, 409);
			assert.equal(conflict.body.error?.code, "IDEMPOTENCY_CONFLICT");
			const stale = await postCommand(app, owner.credential, {
				type: "campaign.scene", campaignId, summary: "A scene",
			}, { expectedRevision: 0, idempotencyKey: "update-2" });
			assert.equal(stale.status, 409);
			assert.equal(stale.body.error?.code, "STALE_REVISION");
			const foreign = await postCommand(app, stranger.credential, { type: "campaign.brief", campaignId });
			assert.equal(foreign.status, 404);
			assert.equal(foreign.body.error?.code, "NOT_FOUND");
		} finally {
			await storage.close();
		}

		const restartedStorage = new SqliteStorage(databasePath);
		try {
			const restartedApp = createServerApp(restartedStorage);
			const listed = await postCommand(restartedApp, ownerCredential, { type: "campaign.list" });
			assert.equal(listed.status, 200);
			assert.equal(listed.body.result?.type, "campaigns");
			if (listed.body.result?.type !== "campaigns") throw new Error("campaign.list returned no campaigns");
			assert.deepEqual(listed.body.result.campaigns, [{ id: campaignId!, name: "Greywater", system: "5e (2024)" }]);
		} finally {
			await restartedStorage.close();
		}
	});

	it("seeds one account and preserves campaign data across real HTTP server restarts", async () => {
		const directory = temporaryDirectory();
		const port = await availablePort();
		const installed = await installLocalServer({ dataDir: directory, host: "127.0.0.1", port });
		assert.match(installed.credential, /^ptl1_[A-Za-z0-9_-]{43}$/);
		assert.equal(installed.endpoint, `http://127.0.0.1:${port}`);
		await assert.rejects(() => installLocalServer({ dataDir: directory }), /already installed/);

		const firstServer = await startServer({ dataDir: directory, host: "127.0.0.1", port });
		let campaignId: string;
		try {
			const created = await fetchCommand(installed.endpoint, installed.credential, {
				type: "campaign.create", name: "Greywater", system: "5e",
			}, { idempotencyKey: "installed-create" });
			assert.equal(created.status, 200);
			assert.equal(created.body.result?.type, "campaigns");
			if (created.body.result?.type !== "campaigns") throw new Error("campaign.create returned no campaign");
			campaignId = created.body.result.campaigns[0]!.id;
		} finally {
			await firstServer.close();
		}

		const restartedServer = await startServer({ dataDir: directory, host: "127.0.0.1", port });
		try {
			const listed = await fetchCommand(installed.endpoint, installed.credential, { type: "campaign.list" });
			assert.equal(listed.status, 200);
			assert.equal(listed.body.result?.type, "campaigns");
			if (listed.body.result?.type !== "campaigns") throw new Error("campaign.list returned no campaigns");
			assert.deepEqual(listed.body.result.campaigns, [{ id: campaignId!, name: "Greywater", system: "5e (2024)" }]);
		} finally {
			await restartedServer.close();
		}
	});

	it("bounds streamed bodies, preserves auth-before-parse, and recovers without partial mutation", async () => {
		const storage = new SqliteStorage(join(temporaryDirectory(), DATABASE_FILENAME));
		try {
			const provider = new LocalCredentialProvider(storage);
			const owner = await provider.issue("bounded-owner");
			const app = createServerApp(storage);
			const unauthenticated = await app.request("/api/commands", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{",
			});
			assert.equal(unauthenticated.status, 401);
			assert.equal((await unauthenticated.json() as CommandResponse).error?.code, "UNAUTHENTICATED");

			const created = await postCommand(app, owner.credential, { type: "campaign.create", name: "Bounded", system: "5e" }, { idempotencyKey: "bounded-create" });
			assert.equal(created.status, 200);
			if (created.body.result?.type !== "campaigns") throw new Error("campaign.create returned no campaign");
			const campaignId = created.body.result.campaigns[0]!.id;
			const oversized = JSON.stringify({
				version: PROTOCOL_VERSION,
				command: { type: "campaign.journal", campaignId, heading: "Too large", body: "x".repeat(1024 * 1024) },
				expectedRevision: 0,
				idempotencyKey: "oversized",
			});
			const chunks = [oversized.slice(0, 64_000), oversized.slice(64_000)].map((part) => new TextEncoder().encode(part));
			let next = 0;
			const streamed = new ReadableStream<Uint8Array>({
				pull(controller) {
					if (next < chunks.length) controller.enqueue(chunks[next++]!);
					else controller.close();
				},
			});
			const response = await app.fetch(new Request("http://localhost/api/commands", {
				method: "POST",
				headers: { authorization: `Bearer ${owner.credential}`, "content-type": "application/json" },
				body: streamed,
				duplex: "half",
			} as RequestInit));
			assert.equal(response.status, 413);
			assert.deepEqual(await response.json(), {
				version: PROTOCOL_VERSION,
				error: { code: "PAYLOAD_TOO_LARGE", message: "Request body exceeds 1048576 bytes" },
			});
			const journal = await postCommand(app, owner.credential, { type: "campaign.brief", campaignId });
			assert.equal(journal.status, 200);
			assert.equal(journal.body.revision, 0);
			const accepted = await postCommand(app, owner.credential, {
				type: "campaign.journal", campaignId, heading: "After recovery", body: "ok",
			}, { expectedRevision: 0, idempotencyKey: "after-recovery" });
			assert.equal(accepted.status, 200);
			assert.equal(accepted.body.revision, 1);
		} finally {
			await storage.close();
		}
	});

	it("bounds concurrent authenticated requests and releases admission after failures", async () => {
		const storage = new SqliteStorage(join(temporaryDirectory(), DATABASE_FILENAME));
		try {
			const provider = new LocalCredentialProvider(storage);
			const owner = await provider.issue("admission-owner");
			const app = createServerApp(storage);
			const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
			let markStarted!: () => void;
			const allStarted = new Promise<void>((resolve) => { markStarted = resolve; });
			const requests = Array.from({ length: 64 }, () => {
				let sent = false;
				const body = new ReadableStream<Uint8Array>({
					pull(controller) {
						if (!sent) {
							sent = true;
							controllers.push(controller);
							if (controllers.length === 64) markStarted();
						}
					},
				});
				return app.fetch(new Request("http://localhost/api/commands", {
					method: "POST",
					headers: { authorization: `Bearer ${owner.credential}`, "content-type": "application/json" },
					body,
					duplex: "half",
				} as RequestInit));
			});
			await allStarted;

			const overloaded = await postCommand(app, owner.credential, { type: "campaign.list" });
			assert.equal(overloaded.status, 503);
			assert.deepEqual(overloaded.body.error, {
				code: "SERVER_BUSY",
				message: "The server is at capacity; retry the request",
			});

			for (const controller of controllers) {
				controller.enqueue(new TextEncoder().encode("{"));
				controller.close();
			}
			const failures = await Promise.all(requests);
			for (const response of failures) {
				assert.equal(response.status, 400);
				assert.equal((await response.json() as CommandResponse).error?.code, "INVALID_INPUT");
			}
			const recovered = await postCommand(app, owner.credential, { type: "campaign.list" });
			assert.equal(recovered.status, 200);
		} finally {
			await storage.close();
		}
	});

	it("rejects bounded complexity and includes the protocol version in replay identity", async () => {
		const storage = new SqliteStorage(join(temporaryDirectory(), DATABASE_FILENAME));
		try {
			const provider = new LocalCredentialProvider(storage);
			const owner = await provider.issue("limits-owner");
			const app = createServerApp(storage);
			const cases = [
				{ command: { type: "map.generate", rooms: 101 }, code: "INVALID_INPUT" },
				{ command: { type: "deck.draw", deckId: "ordinary", count: 51 }, code: "INVALID_INPUT" },
				{ command: { type: "dice.roll", expression: "x".repeat(4097) }, code: "INVALID_INPUT" },
			] as const;
			for (const { command, code } of cases) {
				const result = await postCommand(app, owner.credential, command);
				assert.equal(result.status, 400);
				assert.equal(result.body.error?.code, code);
			}
			const created = await postCommand(app, owner.credential, { type: "campaign.create", name: "Versioned", system: "5e" }, { idempotencyKey: "versioned" });
			assert.equal(created.status, 200);
		} finally {
			await storage.close();
		}
	});

	it("table-tests authorization boundaries, owner filtering, revocation, and principal-scoped create keys", async () => {
		const storage = new SqliteStorage(join(temporaryDirectory(), DATABASE_FILENAME));
		try {
			const provider = new LocalCredentialProvider(storage);
			const owner = await provider.issue("matrix-owner");
			const other = await provider.issue("matrix-other");
			const app = createServerApp(storage);
			const anonCases = [
				{ type: "dice.roll", expression: "1d20" },
				{ type: "campaign.create", name: "Anonymous", system: "5e" },
				{ type: "campaign.journal", campaignId: "missing", heading: "x", body: "y" },
			] as const;
			for (const command of anonCases) {
				const response = await postCommand(app, undefined, command, command.type === "campaign.create" || command.type === "campaign.journal"
					? { idempotencyKey: "anonymous", ...(command.type === "campaign.journal" ? { expectedRevision: 0 } : {}) }
					: {});
				assert.equal(response.status, 401, command.type);
			}
			const ownCreate = await postCommand(app, owner.credential, { type: "campaign.create", name: "Owner", system: "5e" }, { idempotencyKey: "same-key" });
			const otherCreate = await postCommand(app, other.credential, { type: "campaign.create", name: "Other", system: "5e" }, { idempotencyKey: "same-key" });
			assert.equal(ownCreate.status, 200);
			assert.equal(otherCreate.status, 200);
			if (ownCreate.body.result?.type !== "campaigns" || otherCreate.body.result?.type !== "campaigns") throw new Error("campaign.create returned no campaign");
			const ownId = ownCreate.body.result.campaigns[0]!.id;
			const otherId = otherCreate.body.result.campaigns[0]!.id;
			for (const campaignId of [ownId, "not-a-campaign"]) {
				const response = await postCommand(app, other.credential, { type: "campaign.brief", campaignId });
				assert.equal(response.status, 404);
				assert.equal(response.body.error?.code, "NOT_FOUND");
				const mutation = await postCommand(app, other.credential, {
					type: "campaign.journal", campaignId, heading: "Foreign", body: "must not write",
				}, { expectedRevision: 0, idempotencyKey: "foreign-write" });
				assert.equal(mutation.status, 404);
			}
			const competing = await Promise.all(["race-a", "race-b"].map((key) => postCommand(app, owner.credential, {
				type: "campaign.journal", campaignId: ownId, heading: key, body: "one winner",
			}, { expectedRevision: 0, idempotencyKey: key })));
			assert.deepEqual(competing.map(({ status }) => status).sort(), [200, 409]);
			const listed = await postCommand(app, owner.credential, { type: "campaign.list" });
			assert.deepEqual(listed.body.result?.type === "campaigns" ? listed.body.result.campaigns.map(({ id }) => id) : [], [ownId]);
			const replay = await postCommand(app, owner.credential, { type: "campaign.create", name: "Owner", system: "5e" }, { idempotencyKey: "same-key" });
			assert.equal(replay.status, 200);
			assert.equal((replay.body.result as Extract<NonNullable<CommandResponse["result"]>, { type: "campaigns" }>).campaigns[0]!.id, ownId);
			await provider.revoke("matrix-owner", owner.id);
			const revokedReplay = await postCommand(app, owner.credential, { type: "campaign.create", name: "Owner", system: "5e" }, { idempotencyKey: "same-key" });
			assert.equal(revokedReplay.status, 401);
			const otherList = await postCommand(app, other.credential, { type: "campaign.list" });
			assert.deepEqual(otherList.body.result?.type === "campaigns" ? otherList.body.result.campaigns.map(({ id }) => id) : [], [otherId]);
		} finally {
			await storage.close();
		}
	});
	it("sanitizes typed storage failures raised outside command execution", async () => {
		const failures = [
			{
				error: new StorageUnavailableError("private backend wording", new Error("secret cause"), {
					operation: "transaction",
					key: "private/storage-key",
				}),
				status: 500,
				code: "STORAGE_FAILURE",
				message: "Storage operation failed",
				details: { operation: "transaction" },
			},
			{
				error: new StorageError("private backend wording", "private/storage-key"),
				status: 500,
				code: "STORAGE_FAILURE",
				message: "Storage operation failed",
			},
			{
				error: new InvalidKeyError("private/storage-key", "private validation detail"),
				status: 400,
				code: "INVALID_INPUT",
				message: "Storage key is invalid",
			},
		] as const;

		for (const [index, failure] of failures.entries()) {
			const storage = new SqliteStorage(join(temporaryDirectory(), DATABASE_FILENAME));
			try {
				const provider = new LocalCredentialProvider(storage);
				const owner = await provider.issue(`protocol-failure-${index}`);
				const app = createServerApp(storage);
				storage.transaction = async () => { throw failure.error; };

				const response = await postCommand(app, owner.credential, { type: "campaign.list" });
				assert.equal(response.status, failure.status);
				assert.equal(response.body.error?.code, failure.code);
				assert.equal(response.body.error?.message, failure.message);
				assert.deepEqual(response.body.error?.details, "details" in failure ? failure.details : undefined);
				assert.doesNotMatch(JSON.stringify(response.body), /private|secret cause/);
			} finally {
				await storage.close();
			}
		}
	});

});
