import assert from "node:assert/strict";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { LocalCredentialProvider } from "@portents/identity";
import { MemoryStorage } from "@portents/core/memory";
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
});
