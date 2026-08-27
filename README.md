# Portent

A solo tabletop RPG engine. Dice, oracles, decks, random tables and map tiles,
built so that an AI game master can run a game without inventing the dice.

Nothing here calls a language model. It is all deterministic generation that an
agent — or an app, or a person at a terminal — *uses*. That is the point: a roll
that came from a tool can be logged, cited and audited, and a roll that did not
can be spotted.

> **Status: early.** The library is being extracted from a working pi extension.
> Dice and map tiles have landed. Decks, tables, oracles, character sheets and
> campaign state are next.

## Packages

| Package | Directory | What it is |
| --- | --- | --- |
| `@portent/core` | [`lib/`](lib) | The engine. Runs in Node and the browser. |
| `@portent/cli` | `cli/` | `portent roll 6#4d6kh3` and friends. Not written yet. |
| `@portent/pi` | `extensions/pi/` | Extension for the [pi](https://github.com/badlogic/pi-mono) coding agent. Not ported yet. |
| `@portent/web` | `web/` | Browser wrapper. Not written yet. |

## The two ideas

**Honest dice.** Every random result comes from a seeded or crypto-backed source
and can be recorded with an id. A game master that must cite `r-3f9a` for a
number cannot quietly invent one, and an id absent from the ledger is evidence.

**One tile, two projections.** A map tile is authored as ASCII art. That art is
parsed once into a grid, and both the text and the vector renderings read that
same grid — so they cannot describe different tiles. The equivalence is checked,
not promised:

```
#####+#####          the same tile, rendered as SVG, is verified cell by cell
#.O.....O.#          against this text: same coordinates, same kinds, and each
+.........+          cell drawing the symbol its kind is supposed to use
#....T....#
#####+#####
```

Adding a cell kind is one row in the registry plus one shape. Forgetting the
shape is a compile error, a duplicate glyph throws on import, and exits are
derived from the art so a tile cannot claim a door it does not draw.

## Getting started

```bash
pnpm install
pnpm check      # typecheck, test, and bundle for the browser
```

```ts
import { roll, formatRoll, parseTile, renderAscii, renderSvg, exitsOf } from "@portent/core";

formatRoll(roll("2d20kh1+5"));        // advantage
formatRoll(roll("6#4d6kh3"));         // six ability scores in one call
formatRoll(roll("floor((2d6+3)/2)")); // real arithmetic

const tile = parseTile({ id: "hall", name: "Hall", art: ["###+###", "+.....+", "###+###"] });
renderAscii(tile);  // "###+###\n+.....+\n###+###"
renderSvg(tile);    // "<svg …>" — the same tile
exitsOf(tile);      // derived from the art, four exits
```

Dice notation follows Foundry VTT: `4d6kh3`, `2d20kl1`, `1d6x`, `4d6r1`,
`1d20min10`, `5d10cs>=7`, `d%`, `4dF`, `floor((2d6+3)/2)*2`, `8d6 # fireball`,
and a leading `6#` to repeat. Full table in [`lib/README.md`](lib/README.md).

## How it stays portable

The engine is synchronous and depends on nothing but interfaces in
`lib/src/ports`. Persistence is the one asynchronous seam, because IndexedDB
cannot be synchronous:

```
@portent/core          pure engine + port interfaces, no platform code
@portent/core/memory   in-memory Storage (reference implementation)
@portent/core/node     filesystem Storage, the only file importing node:*
@portent/core/browser  IndexedDB Storage
@portent/core/testing  the Storage conformance suite, so your adapter can prove itself
```

Three mechanisms keep that honest rather than aspirational:

1. `lib/src/isomorphism.test.ts` scans every source file and fails on a `node:`
   import, `process`, `Buffer`, or a DOM global outside the two platform
   adapters. The rule is symmetrical — `document` breaks Node exactly as
   `node:fs` breaks the browser.
2. `pnpm check:browser` bundles every browser-facing entry point with esbuild,
   no polyfills and no aliases, and exits non-zero if anything Node-only leaks in.
3. Both bundled Storage adapters run the same published conformance suite, so
   they cannot drift apart.

**Known gap:** the IndexedDB adapter has no automated coverage, because Node has
no IndexedDB. It typechecks and it bundles; it has not been run. A browser test
job is needed before anyone should trust it.

## Content and licensing

Bundled content — tiles, and the decks and tables to come — is original writing,
CC0, with provenance metadata on every pack. Nothing is reproduced from a
published solo system, crit deck or rulebook.

Portent supports D&D 5E and Pathfinder 2E. It is not affiliated with, endorsed
by, or derived from Wizards of the Coast or Paizo, and it contains no rules text
from either.

Code is MIT. See [LICENSE](LICENSE).

## Contributing

There is no contribution process yet; the API is still moving. If you want to
add a tile set or a content pack, the formats are documented in
[`lib/README.md`](lib/README.md) and the tests will tell you what you got wrong.
