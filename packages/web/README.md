# @portent/web

Portent in a browser. Dice, oracles, decks, tables and dungeon maps, with
campaign state in IndexedDB. Nothing leaves the machine.

```sh
pnpm --filter @portent/web dev     # esbuild watch + local server
pnpm --filter @portent/web build   # dist/
```

Not published: it is an application, not a library.

## What it is really for

Two things, and the second matters more than the first.

**It is a usable app.** With a campaign open, every roll gets a ledger id and
decks stay depleted between visits, because the same `Campaign` and `Ledger` the
pi extension uses are running here unchanged.

**It closes a gap the library admitted.** `BrowserStorage` typechecked and
bundled but had no automated coverage, because Node has no IndexedDB. This
package supplies one with `fake-indexeddb` and runs the library's **own published
conformance suite** against it -- the same 22 cases the Node and memory adapters
pass, not a rewrite of them. Breaking `BrowserStorage.append` fails them.

The polyfill is a dev dependency here rather than in `@portent/core`, so the
library ships nothing to make its own test possible.

## Shape

`session.ts` holds all the behaviour and takes its storage as an argument.
`main.ts` is the DOM layer and nothing else. That split is why the interesting
half is tested by assertions rather than by clicking.

The app's `tsconfig.json` deliberately has **no Node types at all**, so a stray
`node:` import fails typecheck rather than surviving to the bundle. Tests use a
second config that adds them.

## Still unproven

`svgToPngBlob` needs a canvas, which `fake-indexeddb` does not provide and Node
does not have. The map's vector view is exercised; rasterising to PNG in a browser
is not. The CLI's PNG path uses `@resvg/resvg-js` and is tested.
