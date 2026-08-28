# @portent/cli

Dice, oracles, decks, random tables and dungeon maps at the command line.

```sh
portent roll 2d20kh1+5 --dc 15
portent roll 6#4d6kh3
portent odds 4d6kh3 --dc 15
portent map --rooms 9 --seed grimhold --svg map.svg --png map.png
portent table encounters-dungeon --count 3
portent oracle "is the gate still guarded?" --likelihood unlikely
portent deck crit-hits --json
```

**This is the stateless half.** Campaigns, character sheets and the roll ledger
live in the pi extension, which keeps state on disk. Nothing here writes to
`~/.portent`, so a deck draw is a one-off rather than something that depletes a
saved pile.

## Two conventions every command shares

**`--json`.** A dice roller is exactly the sort of thing people script against,
so every command has a machine-readable form:

```sh
$ portent roll 2d6+3 --seed j --dc 5 --json
{
  "expression": "2d6+3",
  "seed": "j",
  "results": [{ "total": 9, "dice": [{ "die": "2d6", "rolls": [4, 2], "kept": [4, 2] }], "outcome": "success" }]
}
```

**`--seed`.** Same seed, same result, forever. A bug report can carry the seed
that caused it, and a dungeon regenerates exactly from the one printed beneath it.

## Exit codes

A script needs to tell "I called it wrong" from "it could not do that":

| Code | Means |
|---|---|
| `0` | Fine |
| `1` | It ran and failed -- a dice expression that will not parse, a file it could not write |
| `2` | You called it wrong -- unknown command, unknown flag, missing argument, out-of-range value |

An unknown flag is an **error, not an ignored token**. A typo'd `--seed` would
otherwise silently produce a different result and look like the tool misbehaving.

## Maps

`portent map` builds a rooms-and-corridors dungeon from 7×7 tiles, carved as a
spanning tree first so the result is **connected by construction** rather than by
luck. Three outputs, all of the same dungeon:

- `--out map.txt` -- the ASCII grid, which is also what it prints
- `--svg map.svg` -- the library's vector renderer
- `--png map.png` -- the same vector, rasterised

The vector is the library's own renderer, not a picture of the characters. The
tile suite already proves the ASCII and SVG projections describe the same tile, so
the image cannot drift from the text printed beside it.

`--png` needs `@resvg/resvg-js`, an **optional** dependency because it ships a
native binary. Without it, `--png` says what to install rather than failing with
an unresolved module. A text-only install does not pay for a compiler.

## Colour

Colour when a terminal is attached, plain when the output is piped, and never
when `NO_COLOR` is set. Nothing writes escape codes into a stream another program
is reading.
