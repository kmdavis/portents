# @portents/pi

Portents as a [pi](https://pi.dev) extension: dice, decks, oracles, random
tables, maps and campaign state for solo tabletop play.

Ten `portents_*` tools and six commands, with all the logic in `@portents/core`.
This file is a harness adapter: tool calls in, text out.

**Not cut over yet.** The prototype at `~/.pi/agent/extensions/dnd` is still the
one running live games.

Caves, wilderness hexes and settlements are not available: only the dungeon
generator was ported, and `portents_map` says so rather than describing what it
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

## Development

pi's own packages are ordinary dev dependencies, from npm:

```sh
pnpm install
pnpm typecheck
pnpm test
```

They used to be symlinked out of an installed pi, on the belief that they were not
published anywhere reachable. That belief was wrong -- `@earendil-works/pi-coding-agent`
and `pi-ai` are on the public registry -- and the workaround cost two failure modes
before it was removed: `pnpm install` hit EPERM chmodding pi's read-only bin scripts,
and pnpm pruned the links it did not know about.

The pinned version is what the extension typechecks against. It is not necessarily the
pi you run it in; bump it when pi's extension API moves.
