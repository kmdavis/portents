# Parity with the prototype

This package replaces a working extension that has a live campaign in it. So the
question "did the port change anything?" needs an answer better than "I don't
think so".

Fixtures are captured from the prototype by running it, not by reading it:

```sh
pnpm capture-parity     # write fixtures from the prototype
pnpm check-parity       # fail if the prototype has changed since
pnpm test               # hold this package against the fixtures
```

`PROTOTYPE` points at the prototype directory, default `~/.pi/agent/extensions/dnd`.

## What parity is claimed for

**Dice.** 224 rolls across 8 scripted face cycles, covering every operator the
notation supports: keep/drop, exploding, rerolls, min/max clamps, success
counting, Fudge dice, arithmetic, functions, labels. Each fixture pins four
things:

- the total,
- **the exact line the player reads**, from `formatRoll`,
- the dice actually rolled and which were kept,
- the max/min flags that drive crit and fumble handling.

The third is the subtle one. It pins **the order randomness is consumed in**. A
port that rolls the same dice in a different sequence produces different results
from the same seed, and nothing else in the suite would notice.

**Repeat syntax.** `6#4d6kh3` and `6x4d6kh3` split identically.

**Rejection messages.** What a player sees when they typo an expression is part
of the contract, not an implementation detail, so bad input is pinned too.

## What parity is deliberately not claimed for

These changed on purpose. A parity test over them would be a test that the old
decisions were right.

| Was | Is | Why |
|---|---|---|
| `sheet.md` with a `## Status` prose block as the source of truth | frontmatter canonical, prose generated and marked | The file has to serve a parser and a person; one source of truth with two projections is the only version that cannot drift. |
| `state.json` beside `campaign.md` | state in `campaign.md` frontmatter | Everything a person reads is markdown. One rule for the project beats one per file type. |
| `system: 5e` plus `edition: "2024"` | `system: 5e (2024)` | A system and its printing are one fact about a table. Also freeform, so an unusual system is recordable. |
| Random 4-hex ledger ids, `r-3f9a` | sequential per campaign, `h-1`, `d-2` | Four hex digits had even odds of a duplicate at ~301 rolls. A duplicate makes a cited id resolve to the wrong entry, defeating the point of the ledger. |
| One `kind` for every ledger entry | kind per prefix, cross-checked on lookup | A fabricated citation now resolves to the wrong kind and says so. |
| `$PI_DND_HOME`, `~/dnd` | `$PORTENTS_HOME`, `~/.portents` | One existing user, one `mv`. A compatibility shim would outlive its usefulness. |
| `dnd_*` tool names | `portents_*` | The library is not one game system. |
| Requested roll printed a `/roll` command to copy | confirm dialog, result returned inline | Copy-pasting a command the GM just printed is not the player rolling their own dice, it is clerical work. |

The prototype was fixed for the last of those before this port began, so the
dialog behaviour is shared rather than divergent.

## Reading a failure

A red parity test means one of exactly two things:

1. **The port diverged.** Fix the port.
2. **The prototype changed after the fixture was taken.** Run `pnpm check-parity`
   to confirm, then re-capture and review the diff.

`check-parity` exists so those two cannot be confused. Run it before assuming the
port is at fault.

## Proving the fixtures bite

A parity suite that cannot fail is worse than none, because it reads as evidence.
These mutations were applied to `@portents/core` and each failed as shown:

| Mutation | Failures |
|---|---|
| Drop the bold on the total in `formatRoll` | 224 of 242 |
| Keep-highest keeps the lowest instead | 11 |

The face cycles live **in the fixture file**, not in the test, so adding one
cannot leave the two lists out of step. Degenerate cycles like all-1s catch
off-by-one and formatting errors but cannot tell keep-highest from keep-lowest,
so strictly ascending and descending cycles exist for that; the suite asserts at
least one discriminating cycle is present. Adding the last three took the
keep-highest mutation from 5 failures to 11.
