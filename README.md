# Portent

A solo tabletop RPG engine. Dice, oracles, decks, random tables and map tiles,
built so that an AI game master can run a game without inventing the dice.

Nothing here calls a language model. It is all deterministic generation that an
agent — or an app, or a person at a terminal — *uses*. That is the point: a roll
that came from a tool can be logged, cited and audited, and a roll that did not
can be spotted.

> **Status: early.** The library is being extracted from a working pi extension.
> Dice, map tiles, dungeon generation, visibility, decks, tables and the oracle
> have landed. Character sheets and campaign state are next, then the pi
> extension and the CLI.

## Packages

| Package | Directory | What it is |
| --- | --- | --- |
| `@portent/core` | [`packages/core/`](packages/core) | The engine. Runs in Node and the browser. |
| `@portent/content` | [`packages/content/`](packages/content) | Batteries included: generic plus common systems. |
| `@portent/content-generic` | [`packages/content-generic/`](packages/content-generic) | The generic fallback every other pack overrides. |
| `@portent/cli` | [`packages/cli/`](packages/cli) | `portent roll`, `portent map`, and friends. |
| `@portent/pi` | [`packages/pi/`](packages/pi) | Runs a game inside the pi coding agent. |

Content is a separate package from the engine because content is the part people
will want to fork, extend and version independently. The engine knows how to
parse, validate and render tiles; it ships none of them.

## The two ideas

**Honest dice.** Every random result comes from a seeded or crypto-backed source
and can be recorded with an id. A game master that must cite `r-3f9a` for a
number cannot quietly invent one, and an id absent from the ledger is evidence.

**One tile, two projections.** A map tile is authored as ASCII art. That art is
parsed once into a grid, and both the text and the vector renderings read that
same grid — so they cannot describe different tiles. The equivalence is checked,
not promised:

```
###+###          the same tile, rendered as SVG, is verified cell by cell
#.....#          against this text: same coordinates, same kinds, and each
#.O.O.#          cell drawing the symbol its kind is supposed to use
+.....+
#.O.O.#
#.....#
###+###
```

Adding a cell kind is one row in the registry plus one shape. Forgetting the
shape is a compile error, a duplicate glyph throws on import, and exits are
derived from the art so a tile cannot claim a door it does not draw.

**Tiles are 7×7, doors always centred.** One size, one connector position per
edge, enforced by `standardTileProblems`. That is what lets tiles be laid on a
lattice and simply fit, with no edge-matching logic:

```ts
const map = composeTiles([[hall, corridor, room], [corridor, null, stair]]);
renderAscii(map);  // the whole dungeon as text
renderSvg(map);    // the same dungeon as vectors
```

A composed map is itself a `Tile`, so both projections work on a dungeon
unchanged and the equivalence guarantee comes with them. Where one tile has a
door and its neighbour has wall, the seam is sealed — an assembled map never
shows an exit into solid rock.

**Dungeons are generated connectivity-first.** A randomised depth-first walk
carves a spanning tree over the lattice, so every cell is reachable before any
tile is chosen; each cell then has a required shape and a tile is picked to match.
Most tile generators place a tile and then hunt for neighbours that fit, which
paints itself into corners and leaves disconnected fragments.

```ts
const { map, entrances } = generateDungeon(tiles, { cols: 5, rows: 4, seed: "grimhold" });
```

A connection shape is four bits, so there are sixteen. With rotation, one
authored tile per shape class — dead end, straight, bend, T, cross — covers all of
them, so a small hand-written set generates every layout.

**Sight is modelled properly.** Recursive shadowcasting over eight octants, so
you can see past a pillar on both sides but not through it, and from a doorway you
see the room beyond but not along the wall you stand in. Opacity is separate from
passability, because a chasm blocks movement but not sight and a closed door does
the reverse.

```ts
let view = withActors(createView(map, { sightRadius: 8 }), party);
view = moveActor(view, "brannoc", { x: 5, y: 12 });

renderSvg(map, {
  visibility: { visible: view.visible, explored: view.explored },
  tokens: view.actors,
  viewport: { x: 0, y: 0, width: 13, height: 7 },
});
```

Three states: unknown is not drawn at all, so the players' map cannot leak the
shape of a room they have never entered; explored is dimmed; visible is drawn with
tokens. **Terrain is remembered, creatures are not** — a goblin does not stay where
you last saw it.

## Getting started

```bash
pnpm install
pnpm check      # typecheck, test, and bundle for the browser
pnpm manual     # build the manual-check page, then open manual/index.html
```

```ts
import { roll, formatRoll, parseTileSet, renderAscii, renderSvg, exitsOf } from "@portent/core";
import { dungeonTiles } from "@portent/content";

formatRoll(roll("2d20kh1+5"));        // advantage
formatRoll(roll("6#4d6kh3"));         // six ability scores in one call
formatRoll(roll("floor((2d6+3)/2)")); // real arithmetic

const [tile] = parseTileSet(dungeonTiles);
renderAscii(tile);  // the text
renderSvg(tile);    // "<svg …>" — the same tile
exitsOf(tile);      // derived from the art, never declared
```

Dice notation follows Foundry VTT: `4d6kh3`, `2d20kl1`, `1d6x`, `4d6r1`,
`1d20min10`, `5d10cs>=7`, `d%`, `4dF`, `floor((2d6+3)/2)*2`, `8d6 # fireball`,
and a leading `6#` to repeat. Full table in [`packages/core/README.md`](packages/core/README.md).

## Playing with it

```ts
import { createRegistry, rollTableById, yesNo, sceneCheck, createPile, drawFromPile } from "@portent/core";
import { portentContent } from "@portent/content";

const registry = createRegistry([portentContent]);

sceneCheck({ registry });                        // as expected, skewed, or interrupted
rollTableById("encounters-dungeon", { registry });
yesNo("Is the portcullis still up?", "unlikely", { registry });

let pile = createPile(registry.requireDeck("crit-hits"));
const { cards, pile: next } = drawFromPile(deck, pile);   // the pile is yours to persist
```

Table entries compose, so one roll can do a lot of work:
`{{table:names-dwarf}}`, `{{roll:2d6}}`, `{{pick:north|south}}`, `{{deck:npc-sparks}}`.

The oracle is the part that makes solo play work. At a table the GM is surprised
too; alone, the temptation is to decide whatever suits the story, and then nobody
is playing. The likelihood ladder and the doubles-mean-a-twist rule are original
arithmetic, not a reproduction of any published solo system.

## The command line

```sh
portent roll 2d20kh1+5 --dc 15
portent map --rooms 9 --seed grimhold --png map.png
portent oracle "is the gate still guarded?" --likelihood unlikely
```

Every command takes `--json` for scripting and `--seed` for reproducibility. See
[packages/cli/README.md](packages/cli/README.md).

## Where data lives

`$PORTENT_HOME`, or `~/.portent` by default. Campaign files, character sheets and
maps are markdown you can read, edit and put in git.

Character sheets keep their machine-readable values in frontmatter and their
prose generated from it, so the file serves a parser and a person without the two
drifting apart. Generated sections are marked, and a hand-edit that puts them out
of sync is **reported rather than silently resolved**.

## How it stays portable

The engine is synchronous and depends on nothing but interfaces in
`packages/core/src/ports`. Persistence is the one asynchronous seam, because IndexedDB
cannot be synchronous:

```
@portent/core          pure engine + port interfaces, no platform code
@portent/core/memory   in-memory Storage (reference implementation)
@portent/core/node     filesystem Storage, the only file importing node:*
@portent/core/browser  IndexedDB Storage
@portent/core/testing  the Storage conformance suite, so your adapter can prove itself
```

Three mechanisms keep that honest rather than aspirational:

1. `packages/core/src/isomorphism.test.ts` scans every source file and fails on a `node:`
   import, `process`, `Buffer`, or a DOM global outside the two platform
   adapters. The rule is symmetrical — `document` breaks Node exactly as
   `node:fs` breaks the browser.
2. `pnpm check:browser` bundles every browser-facing entry point with esbuild,
   no polyfills and no aliases, and exits non-zero if anything Node-only leaks in.
3. Both bundled Storage adapters run the same published conformance suite, so
   they cannot drift apart.

**Known gaps.** Two things typecheck and bundle but have no automated coverage,
because Node has neither an IndexedDB nor a canvas: the **IndexedDB storage
adapter** and the **browser PNG rasteriser**. Both are exercised by the manual
page; neither has been run in CI. A browser test job would close this, and until
then they should be treated as unproven.

There is **no Node PNG rasteriser**. `svgToPngBlob` throws in Node with a message
pointing at `@resvg/resvg-js`. Adding a native binary dependency is a decision
rather than a default, so it waits for the CLI.

## Checking it by eye

Some things a test suite cannot judge. The automated tests prove the SVG and the
ASCII describe the same grid, cell for cell; they cannot tell you whether a door
*looks* like a door.

```bash
pnpm manual        # bundles lib + content, no build of either needed
open manual/index.html
```

Seven sections, each checking something a test cannot judge:

1. **A generated dungeon** as SVG beside fixed-width ASCII, with seed, size, loop
   and gap controls. It re-derives both projections in the browser and reports
   whether they agree.
2. **Fog of war** — **click a cell to move the party there.** This is the best way
   to check the field of view: stand beside a pillar, stand in a doorway, walk
   into a room and back out.
3. **PNG**, rasterised in the browser, which should be indistinguishable from the
   SVG above it.
4. **A range of tiles**, cropped, for handing a player one room at a time.
5. **Every cell kind** with its glyph, shape, and movement/sight properties.
6. **Every tile in the pack** in both projections, with its connection shape.
7. **Dice** formatting.

If a picture and its text ever disagree there, that is a real bug — the test suite
believes they match.

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
[`packages/core/README.md`](packages/core/README.md) and the tests will tell you what you got wrong.
