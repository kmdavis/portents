# Character creation

The output of this process is a markdown file. Nothing here is finished until
`portent_sheet { action: "create" }` has run and the file exists.

## Order of work

0. **Know which printing you are building for.** A 2024 5E character has a background
   that grants ability score increases and a species with none; a 2014 one is the other
   way round. A Remaster PF2E character has no alignment and picks a magical tradition
   rather than a school. Check `portent_campaign { action: "brief" }` if you are unsure, and
   do not mix the two.
1. **Concept first, numbers second.** One sentence: "a disgraced temple guard who
   still says the prayers". Ask the player for it, or roll `npc-sparks` and read it as
   a PC.
2. **Ability scores.** Offer the player a choice, and roll in front of them:
   - **Standard array** — 15, 14, 13, 12, 10, 8. Fast, balanced, no dice.
   - **Point buy** — 27 points, or PF2E's four free boosts, if they know the system.
   - **Rolled** — `portent_ask_roll { expression: "6#4d6kh3", reason: "ability scores" }`.
     **One prompt, not six.** The leading `6#` repeats the expression six times and the
     player gets one `/roll` to run, six lines back, and a totals summary. Let the
     player roll their own scores; it matters to them. If the spread is miserable,
     offer a reroll rather than making them play it.
3. **Ancestry/species/race, class, background** in whatever order the player prefers.
   Use the term the printing uses: species in 5E 2024, race in 5E 2014, ancestry in PF2E.
4. **Derived numbers.** Compute and state them: HP, AC, initiative, proficiency or
   level bonus, saves, skill modifiers, spell slots or focus points, speed.
5. **Two hooks.** A bond (someone or something they care about) and a problem (someone
   or something that wants them to fail). Write both into the sheet. These are what you
   will use to generate adventures for the rest of the campaign.
6. **Write the file.** Then read it back to the player as a short summary, not the
   whole sheet.

## Starting level

- **5E:** level 3 by default. Level 1 characters have 8-12 HP and die to one bad round,
  which in solo play means restarting rather than being rescued by four allies.
- **PF2E:** level 1 is fine — the system's action economy and hero points give a lone
  character more outs.
- **Solo survivability:** whatever the system, consider giving the player one of:
  a sidekick/animal companion, a once-per-session reroll, or a "hero point" style
  cheat-death. Say which you are giving them and why.

## The sheet's Status block

`portent_sheet` maintains a `## Status` block of `- **Key:** value` lines. This is the part
you patch during play. Suggested keys are filled in for you by system; add what the
build needs.

5E defaults: Level, HP, Temp HP, AC, Conditions, Hit Dice, Inspiration, Exhaustion,
Spell Slots, Death Saves, XP, Speed, Gold.

PF2E defaults: Level, HP, Temp HP, AC, Conditions, Hero Points, Focus Points,
Dying/Wounded, XP, Speed, Gold.

Use `HP: "22/26"` style values — patching with `"-7"` then does the arithmetic and
clamps at the maximum.

Add class-specific keys as needed: `Rage Uses`, `Ki Points`, `Superiority Dice`,
`Sorcery Points`, `Channel Divinity`, `Wild Shape`, `Bardic Inspiration`, `Focus Points`,
`Concentration` (what spell, so you remember to ask for the save when they take damage).

## Sections to fill

`create` stubs these with `_TBD_`; fill them with `append_section` as you settle details.

- **Skills & Proficiencies** — the modifiers, not just the names. You will need the
  numbers to build `portent_ask_roll` expressions.
- **Attacks & Spellcasting** (5E) / **Strikes & Spells** (PF2E) — each attack with its
  full expression, e.g. `Longbow +7, 1d8+4 piercing, 150/600 ft`. Copy these verbatim
  into `portent_ask_roll` so the player never has to work out their own modifier.
- **Features & Traits** / **Feats & Class Features** — including the ones the player
  will forget they have. Reminding them is part of your job.
- **Equipment** — with quantities for anything consumable: arrows, rations, torches,
  potions, oil. Consumables are one of the few pressures that work in solo play.
- **Background & Bonds** — the bond and the problem from step 5, plus names of people
  who matter.
- **Notes** — running list of what the character knows and suspects.

## Multiple characters

A solo player running two or three characters is common and works fine. Create a sheet
each, and set `set_active: true` on the one whose status belongs in the campaign banner.
Ask for rolls per character by name, and keep each character's turn distinct in combat.

## Levelling up

When the player levels:

1. Patch `Level`, `HP`, `Hit Dice` or the PF2E equivalents.
2. `set_section` for the changed sections rather than appending, so the sheet stays
   readable.
3. Journal it: `portent_campaign { action: "journal", heading: "Level 4" }`.
