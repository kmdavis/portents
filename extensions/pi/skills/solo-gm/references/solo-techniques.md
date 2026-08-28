# Solo techniques

Techniques that exist because there is no other GM to surprise you, and no other players
to disagree with you.

## Set the likelihood before you roll, not after

`portent_oracle { kind: "yes_no", likelihood: ... }` takes: certain, very likely, likely,
even, unlikely, very unlikely, impossible. Choose it from what the fiction has already
established, and say why in one clause:

> The gatehouse was manned this morning, so a guard being there now is *likely*.

If you find yourself picking "unlikely" because a yes would be inconvenient, you are
doing the thing the oracle exists to prevent.

Doubles on the d100 (11, 22, 33...) pull a complication as well. Apply it immediately.
Do not save it for later — a complication banked is a complication forgotten.

## Interpreting "meaning" results

`portent_oracle { kind: "meaning" }` returns an action and a subject, e.g. "conceal / a
debt". It is deliberately vague. Read it against the *current* scene and the most
recently established fact, take the first reading that makes the situation worse or
stranger, and commit. Do not roll again because you did not like it.

## Clocks

A clock is a countdown with visible segments: `portent_campaign { action: "clock",
clock_name: "The ritual completes", segments: 6 }`. Advance it when the fiction says so —
a failed roll, a wasted day, a noisy fight. Tell the player it advanced and how many
segments are left. When it fills, it happens; the tool drops it from the list.

Three clocks is plenty. Good ones:

- A threat completing (the ritual, the siege, the poisoning)
- A pursuer closing (the bounty hunter, the plague, the winter)
- The player's own project (repairing the bridge, earning the guild's trust)

Clocks are how solo play gets tension without an adversarial GM. They tick whether or not
the player engages with them.

## Dungeon as you go

Rather than generating a whole dungeon:

1. `portent_deck { deck: "dungeon-tiles" }` each time the player opens an unexplored exit.
2. `portent_table { table: "dungeon-room-purpose" }` for what the room was for.
3. `portent_table { table: "dungeon-dressing" }` for the one detail they will remember.
4. Roll `encounters-dungeon` when they make noise, linger, or force something.

The tile deck depletes, so the dungeon has a natural size. When the pile runs low, start
closing the map: dead ends, the stair down, the way back out.

For a dungeon you want to keep and revisit, use `portent_map { kind: "dungeon", save_as:
"grimhold-upper" }` instead and stock the rooms up front. Note the seed in the journal
and the exact map regenerates forever.

## Hex crawls and travel

`portent_map { kind: "wilderness" }` gives a hex grid with keyed sites. Per day or per hex:

1. `portent_table { table: "weather" }`
2. A travel roll from the player if the terrain is difficult
3. `portent_table { table: "encounters-wilderness" }` — most entries are not fights
4. If they reach a keyed site, `portent_table { table: "quest-hooks" }` or a `npc-sparks`
   draw to make it worth the walk

Do not narrate three uneventful days. Cut to the first thing that matters.

## Playing NPCs against yourself

The temptation is to have NPCs be helpful, because you want the story to move. Resist it:

- **Roll their attitude.** `portent_oracle { kind: "reaction" }` before you decide whether
  the NPC helps, and let a hostile result stand.
- **Give them one want and one secret** — `npc-sparks` does this for you. Play the want
  openly and the secret only under pressure.
- **Let them be right.** An NPC who correctly refuses the party's stupid plan is more
  memorable than one who goes along with it.
- **Name them.** `portent_table { table: "names-common" }`. A named NPC that survives becomes
  campaign furniture; write them into `world.md` immediately or you will forget them.

## Pacing a solo session

- **One scene, one question.** Every scene should turn on a decision the player makes.
  If a scene has no decision in it, summarise it in a sentence and move on.
- **Cut early.** End the scene on the consequence, not on the tidying up.
- **200 words maximum** before handing control back. This is the discipline that makes
  solo play feel like play rather than like being read to.
- **Offer choices, do not railroad, and do not sprawl.** Two or three concrete options
  plus "or something else" is the sweet spot. An open field with no suggestions stalls
  a solo player as badly as a corridor.
- **Ask about their character.** "What is Brannoc thinking about the temple now?" is a
  legitimate move and it is how solo campaigns get their weight.

## When the player goes somewhere you have not prepared

This is normal and good. In order:

1. `portent_oracle { kind: "yes_no" }` for whether the thing they are looking for exists.
2. `portent_table` or `portent_deck` for what is actually there.
3. Say the first interesting thing the results suggest, and write it into `world.md`
   so it is canon from now on.

Never stall the player because you have nothing prepared. That is what the content packs
are for.

## Failing forward

A failed roll should change the situation, not just deny the action. `portent_oracle
{ kind: "gm_move" }` gives you twenty ways to do that. The three most useful:

- They succeed, but it costs something concrete.
- They fail, and now something else is also true.
- They fail, and the clock advances.

"You don't find anything" is the one outcome to avoid, because the player's only move
after it is to try again.
