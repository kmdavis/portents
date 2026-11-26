# Portents development guide

Portents is a host-neutral tabletop RPG engine for AI-assisted play. The engine supplies mechanics and durable state; the host supplies the GM, model and UI. Read the root README, relevant package READMEs and accepted decisions under `design/` before changing a subsystem. Check source and tests when documentation is stale. See `ROADMAP.md` for current product direction, not development conventions.

## Workspace and conventions

- TypeScript ESM monorepo; Node >=22.6 and pnpm 10.28.0 (see root package.json). Use pnpm, workspace dependencies and the committed lockfile.
- Follow local formatting and strict tsconfig.base.json. Use explicit .ts relative imports and type-only imports where appropriate. Node runs source via type stripping: no enums, namespaces, parameter properties, decorators or other syntax requiring transformation.
- Keep changes focused. Reuse existing abstractions and public exports; avoid unnecessary dependencies, duplicated logic and speculative frameworks. Preserve unrelated user changes.
- Place tests alongside implementation as *.test.ts, using node:test and the existing assertion conventions. Use package scripts to preserve development export conditions.
- Update relevant READMEs and design records when behavior or contracts change. Record intentional breaking changes and migration implications.

## Package boundaries

- packages/core: mechanics, campaign contracts and ports. Keep it free of model SDKs and platform-specific APIs outside explicit adapters. Randomness, clocks and storage are injectable; persistence is asynchronous.
- packages/content-generic, content-dnd, content-pf, setting-greywater: data-only packs, not executable plugins. packages/content assembles the default bundle. Maintain provenance, licensing and explicit registry override behavior.
- packages/guidance: harness-neutral GM guidance and on-demand topics. System guidance belongs in the appropriate content pack and must not reference harness-specific tool names.
- packages/pi and packages/cli: host adapters; keep mechanical decisions in core or shared actions. packages/web provides a UI-free session facade; site contains browser UI and model integration.
- packages/room: experimental transport-neutral coordination, not a hosted multiplayer server.
- manual: visual checks; site/public and site/src are website sources, docs is generated deployment output.

## Invariants

- Honest dice: all mechanical random results come from engine tools. Preserve seed reproducibility, randomness consumption order, exact roll formatting where contracted, and append-only campaign ledger identity. Never fabricate or recycle ledger results.
- Separate GM-only mechanics from player-facing information. Do not expose undiscovered terrain, hidden actors or private resources through player projections. Do not claim UI hiding is a security boundary.
- Maps have one canonical grid for ASCII and SVG. Derive exits from art; standard tiles are 7x7 with centered connectors. Generate connectivity before choosing tiles. Preserve opacity/passability distinction and fog-of-war semantics: terrain is remembered, creatures are not.
- Campaign and character frontmatter is canonical; generated prose must not silently diverge. Preserve stable resource IDs, versioned schemas, explicit validation, human-readable exports and legacy read compatibility. Do not silently rewrite existing campaigns.
- Content remains portable and data-only. Respect original licensing and attribution; do not import proprietary rules or setting material without permission.
- New storage adapters must pass the published storage conformance suite. Respect existing single-writer assumptions; do not claim multiwriter safety without atomic coordination.

## Commands and verification

From the repository root:

- `pnpm install --frozen-lockfile` (use normal install when intentionally updating dependencies).
- `pnpm --filter @portents/core test` (substitute the relevant package).
- `pnpm check` runs typecheck, tests and browser bundle checks.
- `node scripts/build-guidance.mjs --check` verifies generated guidance.
- `pnpm -r build` verifies package builds, matching CI.
- `pnpm manual` builds the manual visual-check page; open manual/index.html for renderer and browser PNG checks.
- `pnpm --filter @portents/site dev` serves the browser demo for interactive verification.

Regenerate guidance with `pnpm build:guidance` after editing source Markdown. Regenerate Greywater resources with `pnpm --filter @portents/setting-greywater build:resources`. Do not hand-edit generated modules; use the appropriate generator, including for licensing notices. Rebuild site output when changing published site sources.

Core's isomorphism tests and browser bundling without polyfills are architectural checks, not optional cleanup. Storage behavior must work on case-sensitive and case-insensitive filesystems. For pi parity changes, read packages/pi/PARITY.md; committed fixtures run without the external prototype. Do not recapture fixtures merely to hide regressions.

Run focused checks during development and relevant full checks before delivery. Report actual results, failures, and checks not run. Never claim runtime verification from source inspection alone. Keep credentials, private campaigns and local machine-specific data out of commits and logs.
