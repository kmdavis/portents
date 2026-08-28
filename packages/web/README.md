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

## Storage defaults to IndexedDB, and can be replaced

A browser gets the right thing with no ceremony, because that is what this package
is for. Anywhere else supplies its own adapter and the session cannot tell:

```ts
new WebSession();                                  // IndexedDB, database "portents"
new WebSession({ database: "my-campaign" });       // IndexedDB, named
new WebSession({ storage: new MyKeyValueStore() }); // anything else
```

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
