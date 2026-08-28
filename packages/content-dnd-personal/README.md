# @portent/content-dnd-personal

**This package is never published.** It is a place to put content typed out of
rulebooks you own, for use in your own game, on your own machine.

## Why it exists separately

`@portent/content-dnd` can only carry what a System Reference Document licenses.
That leaves out a lot -- the Wild Magic surge table, for one, which is not in any
SRD. Owning the book lets you *use* that content. It does not let you publish it.

So the two live apart, and this one layers on top:

```ts
import { createRegistry } from "@portent/core";
import { genericContent } from "@portent/content-generic";
import { dnd2024Content } from "@portent/content-dnd/2024";
import { personalContent } from "@portent/content-dnd-personal";

// Order is the override order, so the personal pack wins.
const registry = createRegistry([genericContent, dnd2024Content, personalContent]);
```

## What stops it escaping

Four independent guards, because one is not enough for something whose whole
risk is accidental distribution:

| Guard | Effect |
|---|---|
| `"private": true` | npm and pnpm **refuse to publish**, full stop |
| `"license": "UNLICENSED"` | npm's documented value for "no rights granted" |
| `"files": []` | nothing would be packed even if publication were forced |
| A licence conformance test | fails if this package ever becomes publishable |

The last one is the important one, because the other three can be edited by
someone who does not know why they are there. `packageLicenseFor` also makes
`UNLICENSED` **dominate**: one non-distributable table and the whole package
reports `UNLICENSED`, so it can never present itself as partly shareable.

No `NOTICE.md` is generated here either. A notice is a document you ship, and
nothing here ships.

## Adding content

Declare `license: "UNLICENSED"` and say honestly where it came from:

```ts
export const wildMagic: Table = {
  id: "wild-magic",
  name: "Wild Magic Surge",
  dice: "1d100",
  provenance: {
    source: "typed from the Player's Handbook I own, for my own game",
    license: "UNLICENSED",
  },
  entries: [/* ... */],
};
```

Do **not** add an `attribution` block. Attribution does not create a right to
redistribute, and a block implies one exists -- the conformance test rejects it.

This directory ships empty on purpose. Filling it is your call about your own
books, and not something a shared repository should make for you.
