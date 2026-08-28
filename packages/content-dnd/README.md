# @portents/content-dnd

Content for fifth-edition d20 fantasy: one pack per printing.

```ts
import { createRegistry } from "@portents/core";
import { genericContent } from "@portents/content-generic";
import { dnd2024Content } from "@portents/content-dnd/2024";

// Generic first: order is the override order.
const registry = createRegistry([genericContent, dnd2024Content]);
```

| Pack | System line | Covers |
|---|---|---|
| `dnd2024Content` | `5e (2024)`, and a bare `5e` | The 2024 Player's Handbook |
| `dnd2014Content` | `5e (2014)` | The original 2014 PHB |

The newer printing claims the bare system name, so a player who says "D&D" gets the
2024 rules. The older printing answers only to its explicit form.

## Licensing

Tables adapted from a System Reference Document carry that document's required
attribution **verbatim**, and `NOTICE.md` is generated from it. See `src/srd.ts`.

- SRD 5.2.1 (2024 rules) is CC-BY-4.0.
- SRD 5.1 (2014 rules) is dual OGL 1.0a and CC-BY-4.0; this package relies on the
  CC-BY grant only.

**Deliberately absent: a wild-magic surge table.** It is in no SRD — 5.0, 5.1 and
5.2.1 all ship Draconic as the only sorcerous origin — so it is rulebook content and
cannot be published here. A test asserts it cannot be added back. The generic pack's
wild-magic deck is original writing and covers the same need.

## GM guidance

`guidance/*.md` is the GM guidance for fifth edition: what is specific to each
printing, and how it plays at the table. It ships as `src/guidance.generated.ts`,
because a content pack must stay pure data to work in a browser — the markdown is the
source, the module is the artifact.

After editing the prose:

```sh
pnpm build:guidance          # regenerate
pnpm build:guidance --check  # what CI and the tests run
```

**Guidance must not name any harness's tools.** A pack is consumed by more than one
consumer and cannot know what they call things. Describe the mechanic and who rolls
it; let the harness say which tool to call. The generator refuses to build otherwise.
