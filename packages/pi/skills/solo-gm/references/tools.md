# Tool and content reference

## Tools

| Tool | Use it for |
| --- | --- |
| `portent_roll` | Every die the GM rolls. Returns a ledger id to cite. |
| `portent_ask_roll` | Every die the player rolls. They confirm in a dialog; the result comes back to you. |
| `portent_odds` | Checking a DC or encounter is fair. Not during narration. |
| `portent_deck` | Cards: dungeon tiles, crits, fumbles, NPC sparks, tactics, wild magic, playing cards. |
| `portent_table` | Random content: encounters, weather, rumours, names, hooks, dressing, traps, treasure. |
| `portent_oracle` | Anything about the world you have not already decided. |
| `portent_map` | Seeded ASCII dungeon, connected by construction. Dungeons only. |
| `portent_campaign` | Create/load a campaign, brief, journal, scene, clocks, world notes, edition. |
| `portent_sheet` | The character sheet on disk. |
| `portent_verify_roll` | Audit a ledger id when a result is challenged. |

### Player-facing commands

The player has these; you do not need to call them, but you should know they exist:

- `/roll <expression>` — their own dice. If a request is outstanding, theirs answers it
  and reaches you at once. An unprompted roll appears immediately too, but does not make
  you respond: acknowledge it only if they meant something by it.
- `/portent [campaign]` — start or resume.
- `/sheet` — print their sheet.
- `/draw <deck>`, `/oracle <question>` — they can pull a card and ask the oracle too.
- `/portent-status` — campaign state and recent ledger.

## Dice notation

Foundry VTT notation. The useful subset:

| Notation | Meaning |
| --- | --- |
| `4d6kh3` | roll 4, keep highest 3 |
| `2d20kh1` / `2d20kl1` | advantage / disadvantage |
| `4d6dl1` | drop lowest |
| `1d8+3` | flat modifier |
| `1d6x` | explode on max face |
| `1d6xo6` | explode once on a 6 |
| `4d6r1` | reroll 1s once |
| `1d10rr<3` | reroll under 3 until it is not |
| `1d20min10` / `1d20max10` | clamp low / high |
| `5d10cs>=7` | count successes |
| `d%` | d100 |
| `4dF` | Fudge dice, -1 to 1 |
| `floor((2d6+3)/2)` | arithmetic, parentheses, floor/ceil/round/abs/min/max |
| `8d6 # fireball` | text after `#` is a label |
| `6#4d6kh3` | repeat the whole expression 6 independent times (`6x` also works) |

The repeat prefix is the fix for "roll this six times": one `portent_ask_roll` or one
`portent_roll`, six results, plus a totals line. Never make the player run the same command
repeatedly.

## What the player sees

Tools that generate the world — `portent_oracle`, `portent_table`, and GM-facing `portent_deck`
draws — return their result behind a **GM only** marker. Convert those into fiction and
say nothing about the mechanism: no ledger id, no tool name, no "the dice decided", no
"scene: skewed".

Mechanics landing on the player's character are the opposite: state the number and cite
the id, because they watched it happen.

## The system line

The system and its printing are **one freeform string**, not two fields:

```
portent_campaign { action: "create", name: "...", system: "5e (2024)" }
portent_campaign { action: "system", system: "pf2e (legacy)" }
```

| Written | Result |
| --- | --- |
| `5e` | `5e (2024)` -- the newer printing always wins |
| `5e (2014)` | kept |
| `5e (2025)` | **error** naming the valid printings |
| `5e (remaster)` | **error**: that is a printing of `pf2e` |
| `Call of Cthulhu 7e` | kept as-is; unknown systems are not second-guessed |

Two systems have printings this knows about: `5e` takes `2024` or `2014`, `pf2e` takes
`remaster` or `legacy`. Anything else is recorded verbatim with whatever parenthetical it
carries.

A campaign with no printing recorded makes the per-turn banner tell you to ask the player.

## Content packs

Decks (`portent_deck { action: "list" }` for the live list):

| Deck | What it is for |
| --- | --- |
| `crit-hits` | Consequences on a critical hit, not just extra damage. |
| `crit-fumbles` | Optional. Agree with the player before using it. |
| `npc-sparks` | Role + want + secret. An NPC you can play immediately. |
| `monster-tactics` | How the enemy actually fights. Draw at the start of every fight. |
| `wild-magic` | When magic goes wrong. |
| `playing-cards` | Standard 54. Initiative, fortune tests, suit-and-rank tables. |

Tables (`portent_table { action: "list" }` for the live list): `encounters-wilderness`,
`encounters-dungeon`, `encounters-urban`, `weather`, `rumours`, `quest-hooks`,
`dungeon-room-purpose`, `dungeon-dressing`, `traps`, `treasure-minor`, `npc-mannerism`,
`gm-moves`, `names-common`, `names-bynames`, `names-dwarf`, `names-elf`, `names-place`,
`tavern-names`, plus the `oracle-*` tables the oracle uses internally.

Table entries can reference each other with `{{table:id}}`, `{{roll:2d6}}`,
`{{pick:a|b|c}}` and `{{deck:id}}`, so one roll can compose a whole result.

## Files

Everything lives under `$PORTENT_HOME` (default `~/.portent`), one directory per campaign:

```
~/.portent/<slug>/
├── campaign.md          premise, tone, table agreements
├── state.json           scene, clocks, deck piles, pending roll, counters
├── journal.md           session log, append-only
├── world.md             NPCs, places, threads, factions
├── characters/*.md      character sheets
├── maps/*.md            saved maps
└── rolls.jsonl          every random event, append-only
```

The player can read and edit any of it by hand. If a sheet looks hand-edited, trust the
file over your memory.

## Adding your own content

Content is a typed package (`@portent/content`), not loose files, and there is no reload
command: decks and tables are compiled in. To add your own, fork that package and
publish a pack -- the shapes are:

Deck: `{ id, name, description, provenance: { source }, cards: [{ name, text, tags?, art?, count? }] }`

Table: `{ id, name, description, provenance: { source }, dice?: "1d20", entries: [{ range?: [1,3], weight?, text }] }`

Dice-keyed tables must cover their dice with no gaps or overlaps; the test suite checks this.
