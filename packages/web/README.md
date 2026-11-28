# @portents/web

Browser and edge integration for Portents: a session facade over the engine.

**No UI, and no agent.** This is the seam a UI sits on. It imports no UI, renders
nothing, and holds no opinion about how anything looks.

```ts
import { WebSession } from "@portents/web";

const session = new WebSession();                 // IndexedDB, no arguments

await session.roll("2d20kh1+5", { dc: 15 });      // ledger ids when a campaign is open
await session.oracle("yes_no", "is the gate still guarded?");
session.map({ rooms: 9, seed: "grimhold" });      // { ascii, svg, seed }
```

## Shared typed commands

The versioned command protocol is the shared boundary for host adapters. Requests
and results are plain serializable data; campaign-scoped commands carry an
explicit public campaign ID. The local executor defaults to identity mapping
between IDs and storage slugs; hosted compositions can provide both directions,
so IDs returned by list/create remain valid inputs. Authentication and ownership
authorization belong to the composing server, not this local executor:

```ts
import { executeCommand, PROTOCOL_VERSION, WebSession } from "@portents/web";

const session = new WebSession();
const result = await executeCommand(session, {
  version: PROTOCOL_VERSION,
  command: { type: "dice.roll", expression: "2d20kh1+5" },
});
```

`createCommandClient(transport)` validates requests and versioned responses while
leaving HTTP encoding and authentication to the transport binding. Unsupported
versions, malformed results, and remote protocol errors fail explicitly.

The client infers the result type from the command and rejects a well-formed
response whose result belongs to a different command.

The executor maps typed core lookup failures to `NOT_FOUND` and structured
`StorageUnavailableError` failures to `STORAGE_FAILURE`; it never classifies by
message text. Unexpected errors become a sanitized `INTERNAL_ERROR`.

Remote clients can pass `{ expectedRevision, idempotencyKey }` to `execute` for a
persistent mutation. `executeWithRevision` returns both the typed result and the
server revision; use a fresh idempotency key for each distinct request and reuse
the original key and revision on retry. `createHttpCommandClient` provides the
HTTP binding and sends the bearer credential in an Authorization header:

```ts
import { createHttpCommandClient } from "@portents/web";

const client = createHttpCommandClient({
  endpoint: "http://127.0.0.1:7331",
  credential: process.env.PORTENTS_CREDENTIAL!,
});
const result = await client.executeWithRevision(
  { type: "campaign.create", name: "Greywater", system: "5e" },
  { idempotencyKey: crypto.randomUUID() },
);
```

Use HTTPS outside loopback. The credential is never placed in the endpoint URL.

Map movement is a stateless transition over a caller-supplied tile and actor
snapshot. `map.moveActor` returns the updated actor positions and visibility
sets; the caller owns persistence and player/GM projection. The command does
not grant access to a hidden map or make UI hiding a security boundary.

## Storage defaults to IndexedDB, and can be replaced

A browser gets the right thing with no ceremony, because that is what this package
is for. Anywhere else supplies its own adapter and the session cannot tell:

```ts
new WebSession();                                  // IndexedDB, database "portents"
new WebSession({ database: "my-campaign" });       // IndexedDB, named
new WebSession({ storage: new MyKeyValueStore() }); // anything else
```

For deterministic tests, use `seed`. Hosts may inject `random` (a `RandomSource` from `@portents/core`) instead; the two options are mutually exclusive. Node hosts can use `defaultRandomSource()` for cryptographic entropy.

| Host | Adapter |
|---|---|
| A browser | the default — IndexedDB |
| A hosted page with a key-value service | your own adapter over that service |
| Node, a worker, a test | `NodeStorage`, `MemoryStorage` |

The only requirement is the `Storage` contract, and the **published conformance
suite** lets any adapter prove it satisfies the same contract the bundled ones do:

```ts
import { storageConformanceCases } from "@portents/core/testing";

for (const c of storageConformanceCases(() => new MyStorage())) it(c.name, c.run);
```

Write the adapter, run the suite, pass it to `WebSession`. Nothing else changes.

## Additional content and settings

Append data-only packs to the batteries-included registry:

```ts
import { greywaterSetting } from "@my-table/portents-greywater";

const session = new WebSession({ extraPacks: [greywaterSetting] });
```

Or pass an exact prebuilt registry when the defaults are not wanted:

```ts
const session = new WebSession({ registry: createRegistry([myPack]) });
```

`registry` and `extraPacks` are mutually exclusive. No plugin code runs; these are the
same plain `ContentPack` values core validates for every other consumer.

## It also closes a gap

`BrowserStorage` typechecked and bundled but had no automated coverage, because
Node has no IndexedDB — the library's README called it unproven. This package
supplies one with `fake-indexeddb` and runs the library's **own** conformance
suite against it: the same 22 cases, not a rewrite. Breaking
`BrowserStorage.append` fails them.

The polyfill is a dev dependency here, not in `@portents/core`, so the library
ships nothing to make its own test possible.

## Still unproven

`svgToPngBlob` needs a canvas, which neither Node nor `fake-indexeddb` provides.
The vector output is exercised; rasterising to PNG in a browser is not. The CLI's
PNG path goes through `@resvg/resvg-js` and is tested.
