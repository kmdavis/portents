# @portents/setting-greywater

A small original setting for Portents. It exists to prove that a package can provide:

- arbitrary Markdown context with structured frontmatter
- stable links among places, NPCs, factions, and threads
- a PNG/JPEG/WebP setting map with typed pins
- system-neutral setting selection
- browser-safe generated data

It is intentionally small enough to audit in one sitting. All prose and metadata are original and dedicated to the public domain under CC0-1.0.

```ts
import { WebSession } from "@portents/web";
import { greywaterSetting } from "@portents/setting-greywater";

const session = new WebSession({ extraPacks: [greywaterSetting] });
await session.createCampaign("The River's Due", "generic", {
  settingId: "portents/greywater",
});
```

Resources are authored under `resources/<kind>/<slug>.md`. Run `pnpm build:resources` after editing them. The generated TypeScript is the browser artifact; Markdown remains the source.

`maps/greywater-region.webp` is an unlabeled regional image. Pin labels and links live in the typed map manifest, not as baked-in image text.
