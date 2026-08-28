# @portent/pi

Portent as a [pi](https://pi.dev) extension: dice, decks, oracles, random
tables, maps and campaign state for solo tabletop play.

Ten `portent_*` tools and six commands, with all the logic in `@portent/core`.
This file is a harness adapter: tool calls in, text out.

**Not cut over yet.** The prototype at `~/.pi/agent/extensions/dnd` is still the
one running live games.

Caves, wilderness hexes and settlements are not available: only the dungeon
generator was ported, and `portent_map` says so rather than describing what it
cannot do.

## Parity

This replaces a working extension with a live campaign in it, so agreement with
the prototype is measured rather than asserted. See [PARITY.md](PARITY.md) for
what parity covers, the seven things that changed on purpose, and how to read a
failure.

```sh
pnpm capture-parity   # write fixtures by running the prototype
pnpm check-parity     # fail if the prototype changed since capture
pnpm test             # hold this package against the fixtures
```

`pnpm test` needs only the committed fixtures, so CI runs it without the
prototype present. `capture-parity` and `check-parity` need `PROTOTYPE` to point
at a prototype checkout, and default to `~/.pi/agent/extensions/dnd`.

## Typechecking needs pi

`@earendil-works/pi-coding-agent` and `pi-ai` are not on a registry this machine
can reach, so they are symlinked from an installed pi:

```sh
pnpm --filter @portent/pi link-pi          # finds pi under ~/.pi/pkg
PI_HOME=/path/to/pi pnpm --filter @portent/pi link-pi
```

`pnpm typecheck` checks for them first and says exactly this if they are missing,
rather than emitting a wall of unresolved-module errors that point at the wrong
problem.

**Without pi, the adapter suite does not run.** It reports that it was skipped
instead of vanishing, because a suite that contributes zero tests and exits 0
looks identical to one that passed.
