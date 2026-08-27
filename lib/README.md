# @portent/core

The Portent engine: deterministic tabletop generators that run in Node and the
browser. No language model, no filesystem access except through a port.

```bash
pnpm add @portent/core
```

## Dice

Foundry VTT notation, parsed by recursive descent so arithmetic and parentheses
work rather than just `NdX+M`.

```ts
import { roll, formatRoll, analyze, chanceOf, splitRepeat } from "@portent/core";

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
import { parseTile, renderAscii, renderSvg, exitsOf, legendOf } from "@portent/core";

const tile = parseTile({
  id: "pillared-hall",
  name: "Pillared Hall",
  tags: ["room", "combat"],
  note: "Good cover, broken sightlines.",
  art: [
    "####+####",
    "#.......#",
    "+.O...O.+",
    "#.......#",
    "#########",
  ],
});

renderAscii(tile);                      // the text
renderSvg(tile, { cellSize: 32 });      // the picture, same tile
exitsOf(tile);                          // [{x:4,y:0,edge:"north",…}, …] derived from the art
legendOf(tile);                         // only the kinds this tile actually uses
```

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

## Storage

The engine is synchronous. Persistence is the one async seam, behind a port:

```ts
import { MemoryStorage } from "@portent/core/memory";
import { NodeStorage } from "@portent/core/node";
import { BrowserStorage } from "@portent/core/browser";

const store = new NodeStorage({ root: "~/portent" });
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
import { detectCaseSensitivity, storageConformanceCases } from "@portent/core/testing";

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
import { roll, seededRandomSource } from "@portent/core";

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
