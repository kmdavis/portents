# @portents/core

The Portents engine: deterministic tabletop generators that run in Node and the
browser. No language model, no filesystem access except through a port.

```bash
pnpm add @portents/core
```

## Dice

Foundry VTT notation, parsed by recursive descent so arithmetic and parentheses
work rather than just `NdX+M`.

```ts
import { roll, formatRoll, analyze, chanceOf, splitRepeat } from "@portents/core";

const result = roll("2d20kh1+5");
result.total;                 // number
result.hasMax;                // a natural 20 among the kept dice
formatRoll(result);           // "2d20kh1+5: [~~7~~, 18] + 5 = **23**"

const dist = analyze("1d20+5");
chanceOf(dist, 15, "atLeast"); // 0.55, exact where the maths allows
```

| Notation | Meaning |
| --- | --- |
| `4d6kh3` / `4d6kl3` | keep highest / lowest 3 |
| `4d6dh1` / `4d6dl1` | drop highest / lowest 1 |
| `2d20kh1` / `2d20kl1` | advantage / disadvantage |
| `1d8+3` | flat modifier |
| `1d6x` / `1d6xo6` | explode on max / explode once on a 6 |
| `4d6r1` / `1d10rr<3` | reroll 1s once / reroll under 3 until it is not |
| `1d20min10` / `1d20max10` | clamp low / high |
| `5d10cs>=7` / `5d10cf<3` | count successes / failures |
| `d%` | d100 |
| `4dF` | Fudge dice, −1 to 1 |
| `floor((2d6+3)/2)*2` | parentheses, `* / %`, `floor` `ceil` `round` `abs` `min` `max` |
| `8d6 # fireball` | text after `#` is a label |
| `6#4d6kh3` | repeat the whole expression six independent times (`6x` also works) |

`analyze` is exact for additive expressions and falls back to a 50,000-iteration
simulation for anything with keep, drop, reroll or explode; the returned
`isSimulated` flag says which you got.

## Map tiles

A tile is authored as ASCII art. The art is the source of truth: it is parsed
once into a grid, and every projection reads that grid.

```ts
import { parseTile, renderAscii, renderSvg, exitsOf, legendOf } from "@portents/core";

const tile = parseTile({
  id: "pillared-hall",
  name: "Pillared Hall",
  tags: ["room", "combat"],
  note: "Good cover, broken sightlines.",
  art: [
    "###+###",
    "#.....#",
    "#.O.O.#",
    "+.....+",
    "#.O.O.#",
    "#.....#",
    "###+###",
  ],
});

renderAscii(tile);                      // the text
renderSvg(tile, { cellSize: 32 });      // the picture, same tile
exitsOf(tile);                          // [{x:3,y:0,edge:"north",…}, …] derived from the art
legendOf(tile);                         // only the kinds this tile actually uses
```

Tiles ship in [`@portents/content`](../content), not here. This package parses,
validates and renders them.

### The standard format

Two rules make a tile set fit together with no matching logic:

1. Every tile is `STANDARD_TILE_SIZE` square — **7×7**.
2. Connectors sit at the **centre of an edge and nowhere else** on the boundary.

Seven because it is the smallest odd number leaving a usable 5×5 interior inside
a wall ring. Odd matters: it gives each edge exactly one centre, so a tile's east
door at `(6,3)` is always opposite its neighbour's west door at `(0,3)`.

```ts
import { standardTileProblems, assertStandardTile, standardEdges } from "@portents/core";

standardTileProblems(tile);   // [] when it conforms
standardEdges(tile);          // ["north", "east", "south", "west"]
```

`standardTileProblems` returns every problem at once, by coordinate, rather than
throwing on the first:

```
has a door at (1,0) on the north edge; connectors must be at the edge centre, x=3
has a connector in the corner at (0,0); corners can never line up with a neighbour
is 11×7, but every standard tile must be 7×7
```

### Rotation

```ts
import { rotateTile, rotations, withRotations } from "@portents/core";

rotateTile(bend, 1);      // 90° clockwise, id becomes "bend@90"
rotations(bend);          // all four orientations
rotations(fourWayHall);   // one — symmetric tiles are deduplicated
withRotations(tileSet);   // every orientation of every tile
```

A square tile with centred connectors maps onto itself under a quarter turn, so a
rotated standard tile is still standard. That is why one authored bend covers all
four orientations, and it is what makes generation possible from a small set.

### Composing a map

```ts
import { composeTiles, renderAscii, renderSvg, tileAt } from "@portents/core";

const map = composeTiles([
  [hall, corridor, room],
  [corridor, null, stair],   // null leaves a gap, which draws nothing
]);

renderAscii(map);       // the whole dungeon as text
renderSvg(map);         // the same dungeon as vectors
tileAt(map, 9, 3);      // { col: 1, row: 0, id: "corridor" }
```

A composed map **is** a `Tile`, so both projections and their equivalence tests
apply to a whole dungeon with no second set of renderers.

Tiles overlap by one cell so neighbours share a wall rather than drawing two.
Where two cells land on the same coordinate, `mergeCells` decides: identical
kinds merge, `void` yields to anything real, two connectors merge to the more
deliberate one, and **anything else seals to wall**. That last rule is the
important one — a door onto a walled neighbour becomes wall, so an assembled map
never shows an exit that goes nowhere.

## Generating a dungeon

```ts
import { generateDungeon, missingSignatures } from "@portents/core";
import { dungeonTiles } from "@portents/content";

const tiles = parseTileSet(dungeonTiles);
missingSignatures(tiles);   // [] — the set can build any layout

const { map, entrances, seed } = generateDungeon(tiles, {
  cols: 5, rows: 4,
  seed: "grimhold",   // same seed, same dungeon, forever
  loopChance: 0.2,    // 0 gives a pure tree of dead ends
  gapChance: 0.1,     // ragged outline; the remainder stays connected
  entrances: 1,
});
```

**Connectivity first, tiles second.** A randomised depth-first walk carves a
spanning tree over the lattice, so every cell is reachable from every other
*before* any tile is chosen. Each cell then has a required signature — the exact
set of edges that must be open — and a tile is picked to match it.

Most tile generators do the opposite, placing a tile and then hunting for
neighbours that fit. That paints itself into corners and produces disconnected
fragments. Doing it this way, the dungeon is connected by construction.

A signature is four bits, so there are sixteen. With rotation, one authored tile
per shape class — dead end, straight, bend, T, cross — covers all of them.
`missingSignatures` tells you what a set cannot build, and generation fails with
the specific missing shape rather than a vague error.

`entrances` matters more than it looks: without one, a single-cell lattice would
require a tile with no exits at all, which cannot exist under the standard
format. Each entrance is returned with its map coordinate, so it is where you put
the party.

## Field of view

```ts
import { computeFov, hasLineOfSight, reachableCells } from "@portents/core";

computeFov(map, [{ x: 12, y: 5 }], { radius: 8 });   // Set of cell keys
computeFov(map, party.map(p => ({ x: p.x, y: p.y }))); // union of the party's sight
hasLineOfSight(map, archer, target);
reachableCells(map, { x: 3, y: 3 }, 6);              // movement, not sight
```

Recursive shadowcasting over eight octants, so pillars, doorways and corners
behave the way a player expects: you can see past a pillar on both sides but not
through it, and standing in a doorway you see the room beyond but not along the
wall you are standing in. Chosen over ray casting because ray casting misses
cells no ray happens to hit, which shows up as speckled holes in a lit room.

Opacity is a property of the cell, separate from passability, because the two
genuinely differ:

| | walkable | see-through |
| --- | --- | --- |
| floor, bridge, stairs | yes | yes |
| chasm | **no** | **yes** |
| closed door, secret door | **yes** | **no** |
| water, rubble, pit | yes | yes |
| wall, pillar, statue | no | no |

A radius lights a disc rather than a square. Pass `isOpaqueAt` to answer "what
if this door were open?" without changing the map.

## What the party knows

```ts
import { createView, withActors, moveActor, revealTile, renderAsciiView } from "@portents/core";

let view = withActors(createView(map, { sightRadius: 8 }), [
  { id: "brannoc", name: "Brannoc", x: 3, y: 18, kind: "pc" },
  { id: "goblin", name: "Goblin", x: 20, y: 4, kind: "foe" },
]);

view = moveActor(view, "brannoc", { x: 5, y: 12 });  // sight recomputed
cellState(view, 3, 18);                              // "explored"
visibleActors(view);                                 // the goblin is not in it
```

Three states, which is what a table actually needs:

- **unknown** — never seen. The GM's map has the room; the players' does not.
- **explored** — seen before, not in sight now. Terrain is remembered.
- **visible** — in someone's field of view right now.

**Terrain is remembered; creatures are not.** A goblin does not stay where you
last saw it, so `visibleActors` and both renderers only show a creature on a
currently visible cell. Party members are always included — you know where your
own people are.

Every mutation returns a new view, because play is full of "what would they see
from over here?" and answering that should not disturb the real state.

`revealTile(view, col, row)` opens up one tile of a composed map without anyone
standing in it — the party walked into room 4, so room 4 is on their map now.

## Rendering a view

```ts
renderSvg(map, {
  viewport: { x: 0, y: 0, width: 13, height: 7 },   // crop, in cells
  visibility: { visible: view.visible, explored: view.explored },
  tokens: view.actors,
  exploredOpacity: 0.42,
});

renderAsciiView(view, { unknownGlyph: " ", viewport });
```

- **Unknown cells are not drawn at all**, rather than drawn dark, so the players'
  map does not leak the shape of a room they have never entered.
- Explored cells are dimmed and carry `data-state="explored"`.
- Tokens are drawn only on visible cells.
- Coordinates stay in **map space** under a crop, so a click maps back to the
  right cell without the caller knowing the crop. The document also carries
  `data-crop-x`, `data-crop-y`, `data-cols`, `data-rows` and `data-cell-size`.
- Only symbols actually drawn are defined, so a fogged or cropped map stays small.

The SVG labels a token with the initial of its name, battle-map style; the ASCII
view uses a fixed glyph per kind (`@` party, `&` ally, `!` foe) because text needs
one column and a stable symbol. Pass `glyph` to override either.

`renderAsciiView` output is **display only and must not be parsed back** — a token
glyph sits on top of the terrain, so the character no longer says what the
terrain is. `renderAscii(tile)` remains the round-trippable projection.

## PNG

The core produces SVG and nothing else, because that is the one thing both
runtimes can do with no dependency. Rasterising needs a platform.

```ts
import { svgToPngBytes, svgToPngDataUrl, svgDimensions } from "@portents/core/browser";

const url = await svgToPngDataUrl(svg, { scale: 2, background: "#f4ecd8" });
```

SVG string to blob, blob to canvas, canvas to PNG. No dependencies, works in a
window or a worker. Size follows `scale`, or an explicit `width`/`height`.

**In Node there is no rasteriser yet.** `svgToPngBlob` throws with a message
pointing at `@resvg/resvg-js`, which is the intended route once the CLI exists.
That is a deliberate gap, not an oversight: adding a native binary dependency is
a decision, not a default.

### Cell kinds

| Glyph | Kind | Glyph | Kind |
| --- | --- | --- | --- |
| (space) | outside | `=` | bridge |
| `#` | wall | `o` | pit |
| `.` | floor | `<` | stairs up |
| `+` | door | `>` | stairs down |
| `S` | secret door | `O` | pillar |
| `A` | archway | `T` | altar |
| `^` | rubble | `i` | statue |
| `~` | water | `*` | brazier |
| `v` | chasm | | |

Rows shorter than the widest are padded with `void`, so irregular cave shapes
need no hand padding. Tabs and control characters are rejected, because a tile
that looks right in one editor and wrong in another defeats the whole design.

### Why the two renderings cannot diverge

- `CellKind` is derived *from* the cell registry, so a kind with no spec cannot
  be named and a spec no kind uses cannot exist.
- The glyph mapping is validated as a bijection inside the construction of the
  lookup tables, so a duplicate glyph throws on import — and cannot be
  tree-shaken away, which a bare module-scope assertion could be.
- The SVG shape table is `Record<CellKind, CellShape>`, so **adding a kind
  without drawing it is a compile error**.
- Exits are computed from boundary cells, never declared, so a tile cannot claim
  a door its art does not have.
- The test suite renders every tile both ways, reconstructs the grid from each,
  and compares them cell by cell — including which symbol each cell references,
  so the visual choice is checked and not merely a label claiming one.

Adding a cell kind: one row in `src/tiles/cells.ts`, one shape in
`src/tiles/svg.ts`. The type checker will not let you skip the second.

### Checking it by eye

The tests prove the two projections describe the same grid. They cannot tell you
whether the picture *looks* right. `pnpm manual` at the repo root builds a page
that renders every tile both ways, side by side, plus a random composed map.

## Decks

```ts
import { createPile, drawFromPile, formatCard } from "@portents/core";

let pile = createPile(deck);                       // shuffled, all cards in
const { cards, pile: next, reshuffled } = drawFromPile(deck, pile);
pile = next;                                       // you own the pile
```

A drawn card stays gone until the deck is reshuffled, which is the point for
decks where depletion matters: a tile deck that runs out gives a dungeon a
natural size, and a crit deck that cannot repeat itself stops the third critical
hit of the session feeling like the first.

**The pile is plain data the caller owns**, and every operation returns a new one.
An earlier version reached into campaign state and mutated it, which meant
drawing a card needed a filesystem. Persistence belongs to whoever owns the
campaign.

`drawEphemeral` draws without a pile, for one-off inspiration where depletion
would be meaningless. `pileMatchesDeck` catches a saved pile whose deck has since
been edited, rather than silently drawing the wrong cards.

## Random tables

```ts
import { rollTableById, tableProblems } from "@portents/core";

rollTableById("encounters-dungeon", { registry }).text;
tableProblems(table);   // [] when the ranges are contiguous and cover the dice
```

Dice-keyed (`dice: "1d20"` plus a `range` per entry) or weighted. Entry text
composes recursively:

```
{{table:names-dwarf}}      roll another table
{{roll:2d6}}               inline dice
{{pick:north|south}}       inline choice
{{deck:npc-sparks}}        draw a card's name
```

So one roll on an encounter table can name the NPC, roll their numbers and pick
their attitude. A broken reference is left **visible** in the output rather than
dropped, because a GM reading `[table:foo failed: Unknown table "foo"]` knows to
fix their pack, whereas a hole in a sentence just looks like a bug.

## The oracle

```ts
import { yesNo, sceneCheck, gmMove, meaning, reaction } from "@portents/core";

yesNo("Is the gate still guarded?", "likely", { registry });
sceneCheck({ registry });   // as expected, skewed, or interrupted
```

This is what makes solo play work. At a table the GM is surprised too; alone, the
temptation is to decide whatever suits the story, and then nobody is playing.

The likelihood ladder runs certain / very likely / likely / even / unlikely / very
unlikely / impossible. Roll in the bottom fifth of the yes band for an emphatic
yes, the far edge for a qualified one. Doubles on the d100 mean something else is
also happening and pull a complication.

The **mechanism** is here; the **words** are in a content pack. `ORACLE_TABLES`
names the six tables the oracle needs and `missingOracleTables(registry)` says
which a pack lacks, so a fork knows exactly what to supply.

## Content packs

```ts
import { createRegistry } from "@portents/core";
import { genericContent } from "@portents/content";

const registry = createRegistry([genericContent, myPack], { allowOverride: true });
```

Lookups go through an injected registry rather than a module-level cache read from
disk. That is what lets the same code run in a browser, lets a caller mix packs,
and lets a test supply three fake tables instead of the whole corpus. Duplicate
ids throw unless `allowOverride` is set, because a silent override is how someone
wonders why their custom table is being ignored.

## Campaigns

Everything a person would read is markdown they can open, edit and put in git.
**There is no `state.json`:** volatile state lives in `campaign.md`'s frontmatter,
with the parts worth reading projected into prose beneath it, exactly as
character sheets work. One rule for the whole project is easier to hold than one
per file type.

```
campaigns/<slug>/
  campaign.md          state in frontmatter, premise and agreements in prose
  journal.md           append-only, one ## section per scene
  world.md             NPCs, Places, Threads, Factions
  rolls.jsonl          the ledger
  characters/<name>.md character sheets
  maps/<name>.txt      saved maps
  piles.json           deck draw piles
```

`piles.json` is the one file that is not markdown, deliberately: a list of card
indices has no reader, and a page of numbers nobody can check is worse than
admitting it is machine state.

```ts
const campaign = await Campaign.create({ storage, clock, random }, {
  name: "The Bell of Wrenfield",
  system: "5e",                      // edition defaults to 2024
  premise: "A drowned village rings its bell at midnight.",
});

await campaign.setScene({ summary: "At the causeway.", location: "Wrenfield", tension: "tense" });
await campaign.setClock("The tide returns", 2, 6, "then the causeway floods");
await campaign.journal("The causeway", "They crossed at low tide.");
await campaign.addToWorld("NPCs", "**Nesta.** Keeps the shrine.");
await campaign.patchCharacter("Brannoc", { HP: "-7" });
```

Which produces a file that reads like this:

```markdown
---
name: The Bell of Wrenfield
system: 5e (2024)
scene:
  summary: At the causeway.
  location: Wrenfield
clocks:
  The tide returns: 2/6 then the causeway floods
---

## Clocks

<!-- portents:generated clocks -->

- **The tide returns** ▰▰▱▱▱▱ 2/6 — then the causeway floods
```

A clock is one line, so a person can advance one in a text editor without
counting commas. Hand-edit it and the library reads it back.

### Every change is written through

A session ends when a laptop shuts, not when someone types "goodbye", so nothing
is batched for later. The cost is more small writes; the benefit is that the file
on disk is always the truth.

### The resume brief

The most important method here. A solo game lives or dies on whether the GM can
recover its state after a break or a context compaction, and a GM that quietly
forgets the scene invents a different one -- which the player experiences as the
world changing behind their back.

```ts
await campaign.brief();
```

Returns scene, active character with status, clocks, any outstanding player roll,
recent journal scenes, recent ledger ids, and anything inconsistent. With no
scene recorded it says so explicitly, and tells the GM to **ask** rather than
invent.

### The system is one freeform line

```yaml
system: 5e (2024)
system: pf2e (remaster)
system: Call of Cthulhu 7e
system: Blades in the Dark (2nd printing)
```

A system and its printing are one fact about a table, so they are one line rather
than two keys. The system is **any string**: nothing in this library assumes d20,
sheets take whatever keys a system needs, and refusing to record a campaign of
something unusual would contradict that.

The safety is kept where it matters. Two systems in wide use have had a revision
that changed character creation, so for those the printing is checked:

| Written | Result |
|---|---|
| `5e` | `5e (2024)` -- the newer printing always wins |
| `5e (2014)` | kept; someone who wants the older one knows it |
| `5e (2025)` | **error:** `Unknown printing "2025" for "5e". Use one of: 2024, 2014` |
| `5e (remaster)` | **error:** `"remaster" is a printing of "pf2e", not "5e"` |
| `Traveller (Mongoose 2e)` | kept verbatim; an unknown system is not second-guessed |

Never a silent fallback -- that would leave the player unable to notice they had
been handed the wrong character creation rules.

## The roll ledger

What makes solo play honest. A GM that invents a die result is indistinguishable
from one that rolls, unless the roll leaves a trace someone can look up
afterwards.

```ts
import { Ledger } from "@portents/core";
import { openHomeStorage } from "@portents/core/adapters/node";

const ledger = await Ledger.open({
  storage: openHomeStorage(),
  key: "campaigns/wrenfield/rolls.jsonl",
  clock: systemClock,
});

const hit = await ledger.append({
  kind: "hit", actor: "goblin archer", reason: "shortbow",
  result: "12 + 4 = 16", dc: 15, outcome: "success",
});
hit.id; // "h-1", cited in the transcript

ledger.describe("h-1");
// h-1: attack roll by goblin archer for shortbow — 12 + 4 = 16 (DC 15: success) at ...
```

### Ids

`{kind}-{sequence}{writer?}` — `h-42`, `d-43`, `k-44`, one counter per campaign.

The sequence is a plain counter, so there is nothing to collide. Four random hex
digits would have given **even odds of a duplicate at only ~301 rolls**, and a
duplicate is worse here than in an ordinary log: auditing a cited id would return
the wrong entry and quietly defeat the one guarantee the ledger provides. The
counter is derived from the log itself, so no state file can desynchronise it.

| | | | |
|---|---|---|---|
| `h-` | to hit | `c-` | card draw |
| `d-` | damage | `t-` | table roll |
| `s-` | skill or ability check | `o-` | oracle |
| `v-` | saving throw | `m-` | map seed |
| `k-` | death save | `z-` | shuffle |
| `i-` | initiative | `r-` | generic |

**The prefix is a checksum, not decoration.** The kind is stored in the entry and
encoded in the id, so lookup goes by number and a citation with the wrong prefix
still resolves — with a warning:

```
ledger.describe("h-4");
// t-4: table roll — a dripping ceiling at ...
//   Warning: cited as attack roll but recorded as table roll; the real id is t-4.
```

That catches a model inventing a plausible citation. A made-up `h-4` does not
merely fail, it resolves to something of the wrong kind and says so — which
separates "this roll never happened" from "a real roll was labelled wrongly".

The left-hand column is citable to the player, who watched it land on their own
character. The right-hand column is GM-facing: `isSecretKind` makes the rule
mechanical rather than only written down, because a player told the scene was
"skewed" cannot un-know it.

### Multiplayer, unpaid for

Sequential ids are safe exactly when writes have a single serialisation point.
One process has that; so does a server owning the ledger for players taking
turns. Clients writing locally and syncing later do not, and that case breaks any
coordination-free scheme except randomness.

So the grammar **reserves** a trailing writer letter, omitted for the sole
writer. Every id today is `h-42`. If concurrent writers arrive, the second gets
`h-42b` and `h-42` is understood as `h-42a`. Nothing existing changes and the
parser already accepts it.

### When it is damaged

Restored backups and hand-edits happen, so nothing is repaired automatically —
ids are cited in journal prose and in a model's context, and renumbering would
break references already written down.

- A duplicate sequence reports **`ambiguous`** rather than returning the first
  match. Silently picking one is how a ledger lies to the person auditing it.
- A corrupt line is **skipped, not thrown**: one bad line must not make the rest
  unauditable. `ledgerProblems()` names the line number.

## Character sheets

One markdown file that is both machine-readable and human-readable, because it
has to be: a GM needs to read HP without guessing, a player needs to read the
whole character without a parser.

```markdown
---
name: Brannoc Thistlewood
system: 5e
status:
  HP: 19/26
  Temp HP: 0
  Hit Dice: 3d10
---

# Brannoc Thistlewood

## Status
<!-- portents:generated status -->
- **HP:** 19/26
- **Temp HP:** 0
- **Hit Dice:** 3d10

## Equipment

- Longbow, 20 arrows
```

**The frontmatter is canonical and the prose is generated from it** — the same
shape as the map tiles, one source of truth and two projections, because the
alternative is two places to change HP and a sheet that eventually disagrees with
itself.

```ts
import { createSheet, patchStatus, stringifySheet, statusValue, sheetProblems } from "@portents/core";

let sheet = createSheet({
  name: "Brannoc Thistlewood",
  meta: { system: "5e", edition: "2024" },
  status: { HP: "26/26", "Hit Dice": "3d10" },
  sections: ["Equipment", "Notes"],
});

sheet = patchStatus(sheet, { HP: "-7" });   // frontmatter and prose both updated
statusValue(sheet, "HP");                   // "19/26"
sheetProblems(sheet);                       // [] when the two agree
```

Generated sections carry a `<!-- portents:generated ... -->` marker so the tools
know what they own and a human knows what not to edit. If someone edits one
anyway, `sheetProblems` **reports the disagreement rather than resolving it** —
the file is the user's, and guessing which side they meant is how you lose
someone's HP. `syncGeneratedSections` rewrites the prose from the frontmatter when
that is what they want.

Nothing here is D&D-specific. `status` and `abilities` are whatever keys the
system needs, and section names are the caller's:

```ts
createSheet({
  name: "Prof. Ashcombe",
  status: { HP: "11/11", Sanity: "58/58", Luck: 45 },
  sections: ["Occupation", "Skills", "Backstory"],
});
```

### Frontmatter

Not a YAML parser. It reads a deliberately small subset and **rejects everything
else with a line number**, rather than half-understanding an anchor and quietly
producing the wrong sheet. What it emits is valid YAML, so Obsidian can read a
sheet; what it accepts is much narrower, so its behaviour is predictable.

Supported: scalars, quoted strings, numbers, booleans, inline and block lists of
scalars, and **one** level of nesting. Keys may contain spaces, because a sheet
needs `Temp HP` and `Hit Dice`. Rejected, each naming the line: tabs, CRLF,
deeper nesting, lists of maps, inline maps, anchors, aliases, `|` and `>` blocks,
`null`, and duplicate keys.

Round-tripping is tested against a corpus chosen to break a naive emitter:
`"2024"`, `"true"`, `22/26`, `1d8+3`, `- x`, `a: b`, `Longbow +7 # 150 ft`, and
the twelve status keys a real 5E sheet uses.

## Storage

The engine is synchronous. Persistence is the one async seam, behind a port:

```ts
import { MemoryStorage } from "@portents/core/memory";
import { NodeStorage } from "@portents/core/node";
import { BrowserStorage } from "@portents/core/browser";

const store = new NodeStorage({ root: "~/portents" });
await store.write("grimhold/journal.md", "# Journal\n");
await store.append("grimhold/journal.md", "They arrived at dusk.\n");
await store.list("grimhold/");   // lexicographic
```

Keys are relative POSIX-ish paths of `[A-Za-z0-9._-]` segments. Traversal,
absolute keys and backslashes are rejected before a path is built. Values are
UTF-8 text. `read` returns `undefined` for a missing key rather than throwing.
Writes are atomic against readers. The full contract, including the deliberate
single-writer assumption, is documented in `src/ports/storage.ts`.

### Writing your own adapter

The conformance suite is published, so your adapter can prove it satisfies the
same contract the bundled ones do:

```ts
import { describe, it } from "node:test";
import { detectCaseSensitivity, storageConformanceCases } from "@portents/core/testing";

const make = () => new MyStorage();
const caseSensitive = await detectCaseSensitivity(make);

describe("MyStorage", () => {
  for (const c of storageConformanceCases(make, { caseSensitive })) {
    it(c.name, () => c.run());
  }
});
```

It returns named cases rather than calling a test runner, so it works under
`node:test`, Vitest or a browser harness.

Case sensitivity is a property of the substrate, not the adapter — the same
`NodeStorage` is case-sensitive on ext4 and case-folding on a default macOS
volume — so probe it and declare it.

## Determinism

Every function that consumes randomness takes the source as an argument, and the
global is read once, at the port boundary:

```ts
import { roll, seededRandomSource } from "@portents/core";

roll("6d20", { rng: seededRandomSource("grimhold") }); // same result, forever, anywhere
```

Clocks work the same way (`systemClock`, `fixedClock`, `tickingClock`), so
timestamped output is testable.

## Development

```bash
pnpm test           # node --test, no build step
pnpm typecheck
pnpm check:browser  # bundles every browser entry point with no polyfills
pnpm build
```

Source is TypeScript that Node runs directly by type stripping, so
`erasableSyntaxOnly` applies: no enums, no namespaces, no parameter properties,
and type-only imports must say `import type`.
