# @portents/server

Local and self-hosted Node server for Portents. The same authenticated HTTP command API and SQLite storage are used in both modes. The HTTP layer uses Hono with its Node adapter; SQLite uses better-sqlite3. The server has no interactive signup, anonymous API, or hosted dependency.

## Requirements

- Node.js 22.6 or newer
- pnpm 10.28.0 for a source checkout

## Install and run locally

From the repository root:
```sh
pnpm install --frozen-lockfile
pnpm -r build
pnpm --filter @portents/server start -- install
pnpm --filter @portents/server start -- start
```

`install` creates `~/.portents/portents.sqlite` (or `PORTENTS_DATA_DIR`), seeds one local principal, and prints its random bearer credential once. The database stores only a credential digest. Store the credential securely; if lost, rotate it with local filesystem access using the CLI command below. There is no signup or anonymous recovery endpoint.

The server binds to `127.0.0.1:7331` by default. Stop it with Ctrl-C or SIGTERM; it closes the listener and database cleanly. Configure `PORTENTS_DATA_DIR`, `PORTENTS_HOST`, and `PORTENTS_PORT` or pass `--data-dir`, `--host`, and `--port` to the CLI. The default host remains loopback; bind a non-loopback address only behind a TLS-terminating reverse proxy.

SQLite connections are serialized within one Node process; opening another connection to the same file while local work is queued or active is rejected. SQLite's 5-second busy timeout still applies across processes. Run one server process per database file; do not run a multi-process server cluster against the same file.

Campaign, resource and sheet misses use typed not-found errors. The shared
protocol sanitizer maps `InvalidKeyError` to `INVALID_INPUT` and `StorageError`
failures to `STORAGE_FAILURE`; only a `StorageUnavailableError`'s stable
operation is exposed. Storage keys, causes, and backend messages are never
returned to HTTP clients.

`backup` uses SQLite's online backup API and includes campaign data, credentials, ownership records, and idempotency receipts. It refuses to overwrite an existing destination. On POSIX, the destination is created as mode `0600` from creation. Protect backups like the live database.

```sh
pnpm --filter @portents/server start -- backup --destination ./portents-backup.sqlite
```

To restore, stop the server and restore into a clean data directory. Restore refuses an existing database or WAL/SHM sidecar, then validates the backup's installation metadata before copying it.

```sh
pnpm --filter @portents/server start -- restore --source ./portents-backup.sqlite --data-dir ./restored-portents
pnpm --filter @portents/server start -- start --data-dir ./restored-portents
```

To rotate a lost or exposed local credential, run this on the machine/filesystem that owns the data directory and securely capture the printed replacement:

```sh
pnpm --filter @portents/server start -- credential-rotate --data-dir ./restored-portents
```

Credential recovery/rotation is a local administrative operation; no anonymous HTTP recovery endpoint exists.

## HTTP client

Every command request requires the seeded bearer credential. There is one endpoint, `POST /api/commands`; there is no anonymous health or signup route. The response may include the campaign revision. Persistent mutations require an expected revision and a unique idempotency key:

The server admits at most 64 in-flight authenticated requests; overload returns HTTP 503 with `SERVER_BUSY`. Hosted deployments must add per-principal rate limiting (and suitable abuse monitoring); the server's global in-flight admission cap is not a substitute.

Idempotency fingerprints include the protocol version and validated command exactly as supplied. An omitted optional field and an explicitly supplied default are distinct requests; retries must reuse the same fields and values.

```ts
import { randomUUID } from "node:crypto";
import { createHttpCommandClient } from "@portents/web";

const client = createHttpCommandClient({
  endpoint: process.env.PORTENTS_ENDPOINT!, // e.g. http://127.0.0.1:7331
  credential: process.env.PORTENTS_CREDENTIAL!,
});
const created = await client.executeWithRevision(
  { type: "campaign.create", name: "Greywater", system: "dnd5e" },
  { idempotencyKey: randomUUID() },
);
const campaignId = created.result.campaigns[0]!.id;
await client.execute(
  { type: "campaign.journal", campaignId, heading: "Opening", body: "The rain begins." },
  { expectedRevision: created.revision!, idempotencyKey: randomUUID() },
);
```

Use HTTPS for any network connection beyond loopback. Never place credentials in URLs, logs, source control, or client-visible error messages.

## Campaign archives

`GET /api/campaigns/{campaignId}/archive` exports an authenticated campaign
snapshot. `POST /api/campaigns/import` imports a version-1 JSON archive and
requires an `Idempotency-Key` header. Imports preserve the campaign's internal
slug and references, assign a new server campaign ID to the authenticated owner,
start at revision zero, and never overwrite an existing campaign. Reusing a key
with the same archive returns the original campaign ID; reusing it with different
content conflicts.

Archives are limited to 64 MiB and contain sorted campaign-relative text files,
per-file SHA-256 checksums, an archive checksum, and fingerprints of the bundled
content packs. Import rejects unsupported formats, unsafe or unexpected file
paths, checksum failures, and missing or changed content packs. Credential,
ownership, and idempotency records are outside the campaign namespace and are
never exported. Pack-owned image assets remain references to the versioned pack;
the text-only campaign storage does not contain binary assets to copy.


## Docker

Build from the repository root so the workspace packages are available:

```sh
docker build -f packages/server/Dockerfile -t portents-server .
docker run --rm -it -v portents-data:/data \
  -e PORTENTS_DATA_DIR=/data portents-server install
docker run --rm -it -v portents-data:/data \
  -e PORTENTS_DATA_DIR=/data -e PORTENTS_HOST=0.0.0.0 \
  -p 127.0.0.1:7331:7331 portents-server start
```

The container volume persists the SQLite database across restarts. The container listens on all its interfaces only because Docker requires that for port forwarding; the published host port is explicitly loopback-bound. For a remote self-hosted deployment, publish only behind TLS and firewall the backend port.
