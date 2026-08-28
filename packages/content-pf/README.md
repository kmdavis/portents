# @portents/content-pf

Content for the Pathfinder-style d20 systems: three printings, original writing
throughout.

```ts
import { createRegistry } from "@portents/core";
import { genericContent } from "@portents/content-generic";
import { pf2eContent } from "@portents/content-pf";

const registry = createRegistry([genericContent, pf2eContent]);
```

| Pack | System line | Contents |
|---|---|---|
| `pf2eContent` | `pf2e (remaster)` | Crit/fumble decks, sheet scaffold |
| `pf2eLegacyContent` | `pf2e (legacy)` | Sheet scaffold (keeps alignment) |
| `pf1eContent` | `pf1e` | Sheet scaffold (BAB, CMB/CMD, separate saves) |

## Why there is no adapted rules content here

Unlike fifth edition, these systems have **no CC-BY reference document**. Rules
content is available under the ORC (remaster) or the OGL (legacy), and:

- **Neither has an SPDX identifier**, so `package.json` could not state what the
  content was actually under. The only `OGL-*` entries in the SPDX list are Open
  *Government* Licence for the UK and Canada.
- **They are mutually exclusive.** Paizo's own licensing page is explicit that
  ORC content cannot be released as Open Game Content and vice versa, so a single
  package could not carry both printings' rules text.
- **The Community Use Policy is not a substitute.** It is non-commercial, requires
  a specific notice, and is revocable "at any time for any reason or for no
  reason" -- the opposite of the durability a published package needs.

So this package carries content *shaped* for these systems rather than taken from
them. Adding ORC content later is possible, but it costs a non-SPDX licence
field, the licence text shipped in the package, and an attribution notice -- so it
belongs in its own package where those costs stay contained.

## The crit decks

Original writing. They **override** the generic decks rather than sitting beside
them, because the generic ones assume losing a turn is a reasonable cost. In a
three-action system it is not, so every cost here is measured in actions:

> **Winded.** The target loses one action on its next turn.

A test asserts no card says "lose your next turn".

Paizo does sell physical critical-hit and critical-fumble card decks. That text is
a commercial product, not open rules content, and none of it is used here.

## GM guidance

`guidance/*.md` is the GM guidance for Pathfinder-style systems: what is specific to each printing, and
how it plays at the table. It ships as `src/guidance.generated.ts`, because a content
pack must stay pure data to work in a browser — the markdown is the source, the module
is the artifact.

After editing the prose:

```sh
pnpm build:guidance          # regenerate
pnpm build:guidance --check  # what CI and the tests run
```

**Guidance must not name any harness's tools.** A pack is consumed by more than one
consumer and cannot know what they call things. Describe the mechanic and who rolls it;
let the harness say which tool to call. The generator refuses to build otherwise.
