# @portent/pi

Portent as a [pi](https://pi.dev) extension: dice, decks, oracles, random
tables, maps and campaign state for solo tabletop play.

Status: **port in progress.** The parity harness and fixtures are in place; the
tools and commands are not ported yet.

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
