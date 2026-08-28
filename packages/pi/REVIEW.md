# Pair-review dispositions

A Standard council reviewed the extension port (`aacbd9a`) and raised 23 findings.
This records what happened to each, including the ones not taken.

**The fast local pass found zero.** Same diff, same base, 33 seconds, 21 files,
0 suggestions. Worth knowing before trusting it on new code: it is a smoke test,
not a review.

## Fixed in `ba96221`

| Severity | Finding | What was wrong |
|---|---|---|
| critical | Typecheck resolves siblings to unbuilt dist | Resolved `@portent/core` via the `types` condition, so a clean checkout failed before anything was built. Fixed with `customConditions: ["development"]`, verified with the packages' `dist` directories deleted. |
| critical | Silent link step leaves typecheck failing | `link-pi.mjs >/dev/null 2>&1` hid the only useful message, and made `typecheck` write symlinks as a side effect. That side effect corrupted my own verification of it. |
| medium | A broken import silently skips the whole suite | Worse than reported: contributed `tests 0` and exited 0, so a broken `@portent/core` looked identical to a missing pi. Presence is probed directly now, and absence is reported by a test that always runs. |
| medium | Deck status and shuffle draw a card instead | `status`/`shuffle`/`recent` fell through to an ephemeral draw with no campaign, returning a card the GM would narrate as real. |
| medium | Ask-roll errors still owe the next `/roll` | A bad expression returned without clearing the request. |
| medium | Pending rolls lose their kind | An answered saving throw was filed under the generic prefix. `PendingRoll` now carries `kind`. |
| medium | `/draw` skips the ledger entry the deck tool writes | Bypassed the append, so a player-initiated draw never reached the audit log while the counter advanced. One `drawAndRecord` helper now. |
| medium | `setSystem` leaves a stale rules line | Wrote a new section and left the old line under the h1. One generated home for it. |
| minor | Dynamic import in sheet tool is redundant | Now static. |
| medium | Skill docs describe tools and commands that are gone | Fixed in the doc pass: the `edition` action and parameter, `kind: "wilderness"`, `/dnd`, `/portent-reload-content`, and the JSON-content instructions all went. A test now checks every tool call in the skills against the registered schemas. |
| medium | `dungeon-tiles` is a tile set, not a drawable deck | The draw-as-you-explore recipe is replaced by generating the dungeon up front and revealing it a room at a time. |
| minor | README says the tools are not ported yet | Rewritten. |

## Taken, but as follow-up work

These are real and I am not disputing them. They are not fixed here because each
needs more than a mechanical edit, and I would rather they were separate changes
than rushed into this one.

| Severity | Finding | Why deferred |
|---|---|---|
| medium | Skills never load from a path with a space | `new URL(...).pathname` percent-encodes. Wants `fileURLToPath`, plus a test that a spaced path resolves -- and I want the test to be a real temporary directory rather than a mocked path. |
| medium | New sheets ignore the campaign's system | `createCharacter` stamps 5E section headings onto a Cthulhu sheet. The fix is a per-system section list, which is a content decision rather than an adapter one. |
| medium | Parity never checks the messages it pins | The rejection fixtures assert that both sides throw, not that they say the same thing. Tightening it means deciding whether message text is part of the contract; I think it is, which makes this a fixture recapture. |
| medium | `oracleAnswer` has no library test | It is exercised only through the harness, which needs pi. It belongs in `packages/core/src/oracle/oracle.test.ts`. |
| minor | Each die in a batch rewrites `campaign.md` | Six ability scores rewrite the file six times, and the repeat cap is fifty. Wants a counter that flushes once per batch. |
| minor | A new oracle kind answers as a GM move | `gm_move` is the `default:` branch, so a seventh kind would silently misroute. Wants an exhaustive switch with a throwing default. |
| minor | Saving a map is dropped with no campaign | `save_as` is silently ignored. Should say so. |

## Not taken

| Finding | Why |
|---|---|
| Adapter has no coverage without a linked pi | Accurate, but it is the consequence of pi not being installable here, not a defect to fix. The suite now says so out loud, which is the honest version. Making the adapter testable without pi would mean a fake harness in the shipped package, and the fake would be the thing under test. |
| Two library imports are never used | Already gone with the dynamic-import fix. |
