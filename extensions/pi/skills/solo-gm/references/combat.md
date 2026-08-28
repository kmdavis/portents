# Combat

Solo combat has a specific failure mode: a lone character against four goblins is either
trivial or lethal, with very little in between, and it takes twenty exchanges to find out
which. Design fights to resolve in three or four rounds.

## Before the first roll

1. **Draw the enemy's plan.** `portent_deck { deck: "monster-tactics" }`. This is the single
   highest-value habit in this file — it stops every fight being "they walk up and hit you".
2. **State the stakes and the exits.** Say out loud what happens if the player loses, and
   what escape looks like. A fight the player cannot flee is a different kind of scene.
3. **Describe the terrain in three concrete features.** Cover, height, hazard. If the
   room came from `portent_map` or `dungeon-tiles`, use what is on the tile.
4. **Initiative.** `portent_ask_roll { expression: "1d20+3", reason: "initiative" }` for the
   player, `portent_roll` for the enemy, then write the order out and keep it in every round
   header.

## Round structure

Open each round with a one-line header so the player never loses track:

> **Round 2** — Brannoc (9/26 HP) · bugbear (badly hurt) · two hobgoblins

Then, for the player's turn, ask what they do. For enemy turns, narrate and roll. Keep
each enemy's turn to one or two sentences.

Ask for the player's rolls **one at a time**: attack first, then damage only if it hit.
Asking for "attack and damage" together means telling them the AC, and it wastes their
roll when they miss.

## 5E specifics

- Action, bonus action, movement, one free object interaction, reaction.
- Advantage/disadvantage: `2d20kh1` and `2d20kl1`. Use these liberally as your main
  dial instead of inventing situational modifiers.
- Death saves: three failures dies, three successes stabilises, a natural 20 is back up
  at 1 HP. These are the player's rolls: `portent_ask_roll { expression: "1d20", reason: "death save" }`.
  Patch the `Death Saves` status key after each one.
- Concentration: when the player takes damage while concentrating, ask for a CON save
  at DC 10 or half the damage, whichever is higher. Track what they are concentrating on
  in the sheet's Status block so you remember to ask.
- Crits: double the dice, not the modifier. Optionally draw `crit-hits` instead.

## PF2E specifics

- Three actions per turn, plus a reaction. Most things cost one action; casting usually
  costs two.
- **Multiple attack penalty:** second attack in a turn is at -5, third at -10 (-4/-8 with
  agile). This is the main reason PF2E turns are interesting; enforce it.
- **Four degrees of success:** beat the DC by 10 for a critical success, fail by 10 for a
  critical failure. A natural 20 improves the degree by one step, a natural 1 worsens it.
  The dice tool reports natural 20s and 1s, so you can apply this without guessing.
- Dying/Wounded: dying increases with each hit while down; wounded makes the next one
  worse. Track both in the Status block.
- Hero points: one at the start, more for good play. Spending one rerolls a check;
  spending all of them recovers from dying. Remind the player they have them.

## Statting monsters on the fly

You do not need the exact printed stat block. What you need, and should decide before
round one:

| Thing | How to pick it |
| --- | --- |
| AC | 5E: 11 + about half CR. PF2E: 15 + level. |
| HP | Enough for the number of rounds you want it to last, not the book value. |
| Attack bonus | 5E: +3 to +5 at low level, +7 at mid. PF2E: level + 8ish. |
| Damage | One die plus 2-4 at low level. Aim at roughly a quarter of the player's HP. |
| Saves | One strong, one weak, and say which when it matters. |
| One trick | The thing that makes it memorable: it grapples, it screams for help, it splits. |

Say plainly that you are approximating if the player asks. Do not present an invented
number as the printed stat block.

## Making the fight matter

- **Give enemies a reason to stop.** Most creatures do not fight to the death. Morale
  check at half strength: `portent_oracle { kind: "reaction" }` or a straight `portent_roll`.
- **Change the situation on round two.** Reinforcements, terrain collapse, a hostage,
  the fire spreading, a second objective. A static fight is a spreadsheet.
- **Use conditions rather than only damage.** Frightened, grappled, prone, blinded,
  slowed. They shape decisions in a way that a bigger damage die does not.
- **Let the player's environment work.** If they describe using the chandelier, the oil,
  the ledge — say yes and set a DC. Reward the reading of your own scenery.
- **Draw `crit-hits` on crits** and `crit-fumbles` on natural 1s if the player wants
  that. Ask once, at session zero, and record the answer in `campaign.md`.

## When the player is about to die

Solo death is campaign-ending, so telegraph it. Before the blow that would drop them,
say what is about to happen and give them one out: a costly escape, an item they could
burn, a surrender the enemy would accept. If they take the risk anyway, honour the dice.
