# @portent/content

Content packs for [Portent](https://github.com/kmdavis/portent): dungeon tiles,
and decks and random tables as they land.

**Data only.** Everything here is a plain value that `@portent/core` knows how to
parse, validate and render; nothing in this package has behaviour of its own.
`@portent/core` is a peer dependency and only its *types* are imported, so
installing this adds nothing to a bundle but the data.

```bash
pnpm add @portent/content @portent/core
```

```ts
import { parseTileSet, renderAscii, renderSvg, composeTiles } from "@portent/core";
import { dungeonTiles } from "@portent/content";

const tiles = parseTileSet(dungeonTiles);
renderSvg(tiles[0]);
renderAscii(composeTiles([[tiles[0], tiles[1]], [tiles[2], tiles[3]]]));
```

## Dungeon tiles

27 tiles, all 7×7, every connector at the centre of an edge. That is what makes
them fit together with no matching logic: a tile's east door is always opposite
its neighbour's west door.

```
###+###     #######     ###+###
#.....#     #######     #i...i#
#.O.O.#     #######     #.....#
+.....+     +.....+     +..*..+
#.O.O.#     #######     #.....#
#.....#     #######     #i...i#
###+###     #######     ###+###
Pillared    Straight    Statue
Hall        Corridor    Gallery
```

Tiles are authored as ASCII art, which is the source of truth. The graphical
rendering is a projection of the same parsed grid, so the two cannot disagree,
and exits are derived from the art rather than declared, so a tile cannot claim a
door it does not draw.

### Adding a tile

Add a `TileSource` to `src/dungeon-tiles.ts` and run `pnpm test`. The suite will
tell you if you got it wrong, by name and coordinate:

```
pillared-hall: has a door at (1,0) on the north edge; connectors must be at the edge centre, x=3
straight-corridor: is 11×7, but every standard tile must be 7×7
```

What it checks:

- 7×7, and every connector at an edge centre — no corners, no off-centre doors.
- At least one exit, and somewhere to stand.
- Round-trips through ASCII, and the SVG draws exactly the cells the grid holds.
- Every cell kind in the registry is used by some tile, so no shape ships unlooked-at.
- Kebab-case unique ids, a name, a note, at least one tag.
- **Every pair of tiles, in both orientations, composes without a door opening
  onto rock.**

The cell vocabulary lives in `@portent/core` (`src/tiles/cells.ts`) and the
legend is generated from it, so it can never describe a character the parser
rejects. Adding a new kind of cell is a change to the engine, not to this
package.

## Decks and tables

Six decks and 23 tables, all original writing except the standard 54-card French
deck, which is public domain.

```ts
import { createRegistry, rollTableById, yesNo } from "@portent/core";
import { portentContent } from "@portent/content";

const registry = createRegistry([portentContent]);
rollTableById("encounters-dungeon", { registry });
yesNo("Is the gate still guarded?", "likely", { registry });
```

**Decks:** `crit-hits`, `crit-fumbles`, `npc-sparks`, `monster-tactics`,
`wild-magic`, `playing-cards`.

**Tables:** encounters (dungeon/wilderness/urban), weather, rumours, quest hooks,
dungeon room purpose, dungeon dressing, traps, minor treasure, NPC mannerisms,
GM moves, names (common/bynames/dwarf/elf/place), tavern names, and the five
`oracle-*` tables the oracle needs.

Entries compose: `{{table:id}}`, `{{roll:2d6}}`, `{{pick:a|b}}`, `{{deck:id}}`.

Every deck and table is checked by `pnpm test`: dice-keyed ranges must be
contiguous and cover their dice, every reference must resolve, every entry must
render without leaving a failure marker, and the six tables the oracle requires
must be present.

## Licensing

All original writing, CC0. Nothing is reproduced from a published rulebook, solo
system or commercial deck.

Package code is MIT, like the rest of the repo.

## GM guidance

`guidance/*.md` is the GM guidance for the generic fallback: what is specific to each printing, and
how it plays at the table. It ships as `src/guidance.generated.ts`, because a content
pack must stay pure data to work in a browser — the markdown is the source, the module
is the artifact.

After editing the prose:

```sh
pnpm build:guidance          # regenerate
pnpm build:guidance --check  # what CI and the tests run
```

**Guidance must not name any harness's tools.** A pack is consumed by more than one
consumer and cannot know what they call things. Describe the mechanic and who rolls it;
let the harness say which tool to call. The generator refuses to build otherwise.
