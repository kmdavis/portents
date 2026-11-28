import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { PROTOCOL_VERSION, type CommandResponse } from "@portents/web";
import { createServerApp } from "./app.ts";
import { backupServer, DATABASE_FILENAME, installLocalServer, restoreServer, rotateLocalCredential } from "./runtime.ts";
import { SqliteStorage } from "./sqlite-storage.ts";

const directories: string[] = [];
function temp(): string {
 const path = mkdtempSync(join(tmpdir(), "portents-runtime-"));
 directories.push(path);
 return path;
}
after(() => { for (const path of directories) rmSync(path, { recursive: true, force: true }); });
async function command(app: ReturnType<typeof createServerApp>, credential: string, value: unknown, metadata: object = {}) {
 const response = await app.request("/api/commands", { method: "POST", headers: { authorization: `Bearer ${credential}`, "content-type": "application/json" }, body: JSON.stringify({ version: PROTOCOL_VERSION, command: value, ...metadata }) });
 return { status: response.status, body: await response.json() as CommandResponse };
}

describe("server lifecycle", () => {
 it("restores authentication, ownership, revision, receipts, and ledger; rotates credentials locally", async () => {
  const sourceDir = temp();
  const backup = join(temp(), "backup.sqlite");
  const install = await installLocalServer({ dataDir: sourceDir });
  const storage = new SqliteStorage(join(sourceDir, DATABASE_FILENAME));
  let campaignId: string;
  let rollResult: unknown;
  try {
   const app = createServerApp(storage);
   const created = await command(app, install.credential, { type: "campaign.create", name: "Greywater", system: "5e" }, { idempotencyKey: "create" });
   assert.equal(created.status, 200);
   if (created.body.result?.type !== "campaigns") throw new Error("Missing created campaign");
   campaignId = created.body.result.campaigns[0]!.id;
   const changed = await command(app, install.credential, { type: "campaign.journal", campaignId, heading: "Opening", body: "Rain." }, { expectedRevision: 0, idempotencyKey: "journal" });
   assert.equal(changed.body.revision, 1);
   const rolled = await command(app, install.credential, { type: "dice.roll", campaignId, expression: "1d20" }, { expectedRevision: 1, idempotencyKey: "roll" });
   assert.equal(rolled.status, 200);
   assert.equal(rolled.body.revision, 2);
   rollResult = rolled.body.result;
   await backupServer(sourceDir, backup);
   await assert.rejects(() => backupServer(sourceDir, backup));
   if (process.platform !== "win32") assert.equal(statSync(backup).mode & 0o777, 0o600);
  } finally { await storage.close(); }
  const targetDir = temp();
  await restoreServer(backup, targetDir);
  const restored = new SqliteStorage(join(targetDir, DATABASE_FILENAME));
  try {
   const app = createServerApp(restored);
   assert.equal((await command(app, install.credential, { type: "campaign.list" })).status, 200);
   const stranger = await command(app, "ptl1_" + "x".repeat(43), { type: "campaign.list" });
   assert.equal(stranger.status, 401);
   const replay = await command(app, install.credential, { type: "campaign.journal", campaignId: campaignId!, heading: "Opening", body: "Rain." }, { expectedRevision: 0, idempotencyKey: "journal" });
   assert.equal(replay.status, 200);
   assert.equal(replay.body.revision, 1);
   const replayedRoll = await command(app, install.credential, { type: "dice.roll", campaignId: campaignId!, expression: "1d20" }, { expectedRevision: 1, idempotencyKey: "roll" });
   assert.equal(replayedRoll.status, 200);
   assert.equal(replayedRoll.body.revision, 2);
   assert.deepEqual(replayedRoll.body.result, rollResult);
   const changedPayload = await command(app, install.credential, { type: "campaign.journal", campaignId: campaignId!, heading: "Other", body: "Changed." }, { expectedRevision: 0, idempotencyKey: "journal" });
   assert.equal(changedPayload.status, 409);
   const current = await command(app, install.credential, { type: "campaign.brief", campaignId: campaignId! });
   assert.equal(current.body.revision, 2);
   const journal = await restored.read(`campaigns/${campaignId}/campaigns/greywater/journal.md`);
   assert.equal((journal?.match(/## Opening/g) ?? []).length, 1);
   const rotated = await rotateLocalCredential(targetDir);
   assert.equal(rotated.principalId, install.principalId);
   const rotatedStorage = new SqliteStorage(join(targetDir, DATABASE_FILENAME));
   try {
    const rotatedApp = createServerApp(rotatedStorage);
    assert.equal((await command(rotatedApp, install.credential, { type: "campaign.list" })).status, 401);
    assert.equal((await command(rotatedApp, rotated.credential, { type: "campaign.list" })).status, 200);
   } finally { await rotatedStorage.close(); }
   assert.ok((await restored.list(`server/owners/${install.principalId}/`)).includes(`server/owners/${install.principalId}/${campaignId}`));
   assert.ok((await restored.list(`server/create-replays/${install.principalId}/`)).includes(`server/create-replays/${install.principalId}/create`));
   const campaignKeys = await restored.list(`campaigns/${campaignId}/`);
		assert.ok(campaignKeys.some((key) => key.endsWith("rolls.jsonl")));
   const rolls = await restored.read(`campaigns/${campaignId}/campaigns/greywater/rolls.jsonl`);
   assert.ok(rolls && rolls.length > 0);
   assert.ok(campaignKeys.some((key) => key.endsWith("journal.md")));
  } finally { await restored.close(); }
 });

 it("refuses restore into database or stale sidecar destinations", async () => {
  const source = temp();
  const backup = join(temp(), "backup.sqlite");
  await installLocalServer({ dataDir: source });
  await backupServer(source, backup);
  const dirty = temp();
  copyFileSync(backup, join(dirty, DATABASE_FILENAME));
  await assert.rejects(() => restoreServer(backup, dirty), /clean/);
  const sidecar = temp();
  writeFileSync(join(sidecar, `${DATABASE_FILENAME}-wal`), "stale");
  await assert.rejects(() => restoreServer(backup, sidecar), /clean/);
 });
});
