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
```

`install` creates `~/.portents/portents.sqlite` (or `PORTENTS_DATA_DIR`), seeds one local principal, and prints its random bearer credential once. The database stores only a credential digest. Store the credential securely; if lost, rotate it with local filesystem access using the CLI command below. There is no signup or anonymous recovery endpoint.

The server binds to `127.0.0.1:7331` by default. Stop it with Ctrl-C or SIGTERM; it closes the listener and database cleanly. Configure `PORTENTS_DATA_DIR`, `PORTENTS_HOST`, and `PORTENTS_PORT` or pass `--data-dir`, `--host`, and `--port` to the CLI. The default host remains loopback; bind a non-loopback address only behind a TLS-terminating reverse proxy.

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
