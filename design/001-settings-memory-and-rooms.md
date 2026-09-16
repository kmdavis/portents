# Settings, campaign resources, image maps, and rooms

Status: accepted for implementation

## Decision

Portents will represent setting context and campaign memory as small Markdown resources with a versioned, structured envelope. Resources live at known paths and are loaded on demand. Portents will not own conversation compaction.

Non-dungeon setting maps are raster images with normalized pins. Multiplayer uses an authoritative room coordinator. The first coordinator is in-process and experimental; networking, authentication, provider execution, and durable multiwriter storage are separate hosted-adapter work.

## Why

The current campaign is durable but not retrievable. It stores current state in `campaign.md`, an append-only `journal.md`, and NPCs, Places, Threads, and Factions in one growing `world.md`. `brief()` reads only current state, two recent journal sections, and five ledger entries. The browser cannot use the existing world action at all.

A fully typed setting graph would force prose and cartography into an ontology before the domain is understood. Unstructured Markdown alone has no stable identity, links, visibility, validation, or deterministic lookup. A small typed envelope around Markdown supplies those handles without constraining the prose.

## Resource identity

Setting IDs and resource IDs are lowercase ASCII path-like identifiers. Each contains at least two segments. Examples:

```text
portents/greywater
portents/greywater/place/riverside-shrine
portents/greywater/npc/nesta
```

A packaged resource ID starts with its setting ID plus `/`. IDs are stable and are not derived again from display names. Renaming a person or place does not rename its ID.

Campaign-local resources use the same document contract. Their storage path is independent of their resource ID:

```text
campaigns/<campaign>/world/<kind>/<slug>.md
```

`kind` and `slug` are lowercase storage-safe segments. Initial kinds include `npc`, `place`, `faction`, `thread`, `ruling`, and `note`; other kinds are allowed. The path rejects absolute paths, traversal, dot segments, backslashes, non-Markdown extensions, and reserved legacy names.

Existing `world.md` remains readable as a legacy resource. No file is rewritten or migrated automatically.

## Resource documents

A resource has:

- `schemaVersion: 1`
- stable `id`
- `settingId` when it belongs to packaged setting canon
- open `kind`
- display `name`
- optional aliases, tags, and links to other stable resource IDs
- audience selectors
- optional `supersedes` reference
- optional provenance
- arbitrary Markdown body
- preserved extra frontmatter within Portents' existing scalar, scalar-list, and one-level scalar-map subset

Packaged resources are immutable. Campaign resources are mutable and may refer to packaged resources with `supersedes`; Portents presents both setting canon and campaign developments rather than silently editing package data.

Unknown additive frontmatter is preserved when a resource is parsed and written. Unknown `schemaVersion` values fail explicitly. Breaking schemas require a new reader/contract; v1 does not silently migrate files.

Resource query is deterministic local filtering, not semantic search. It searches id, name, aliases, tags, links, and body case-insensitively and returns a stable order. There are no embeddings, hidden indexes, generated summaries, or ranking model.

## Content packs and layering

`ContentPack` may contain setting manifests, resources, and image maps. Registry IDs remain globally unique. A collision is an error unless the later pack declares an override, using the existing override mechanism.

Direct callers may inject a registry. `WebSession` gains an additive `registry` or `packs` option. The pi package exports a factory accepting extra packs while its default export keeps the batteries-included bundle.

Packs stay data-only. They cannot run hooks or fetch assets.

## Raster setting maps

A setting image map contains:

- stable ID and setting ID
- name and open scope such as `world`, `nation`, `region`, or `city`
- an opaque package-relative asset key
- MIME type restricted to `image/png`, `image/jpeg`, or `image/webp`
- positive pixel width and height
- required alt text
- zero or more pins with unique IDs, normalized `x` and `y` coordinates in `[0, 1]`, labels, and optional resource targets

Core validates metadata but never imports, fetches, decodes, or trusts image bytes. A host resolves `(packId, assetKey)`. GeoJSON, projections, vector layers, and map editing are out of scope.

## Campaign tools

Two model-facing capabilities cover the resources:

- `portents_recall`: list, exact read, and deterministic query across packaged setting resources and campaign resources
- `portents_remember`: create or replace one campaign Markdown resource

Writes are explicitly local single-writer operations until a room adapter owns them. Packaged resources cannot be written.

The site and pi adapters share the same action implementation. Existing action-name mismatches are compatibility aliases during the transition: `load` and `open` both work.

## Compaction

Portents does not implement conversation compaction, event-log compaction, token telemetry, message pruning, or summarization.

Pi uses pi's compaction. The browser site is an in-memory demonstration. A future hosted application chooses compaction with its agent framework. Resource files make that safe because setting and campaign facts do not depend on retaining the whole conversation.

## Multiplayer rooms

`@portents/room` is an experimental transport-neutral package. Solo mode is a room with one human participant.

The room contract includes:

- participants with stable IDs and explicit roles
- character controller assignments; one participant may control several characters and a character may have several controllers
- addressed input requests
- response windows in `all`, `any`, or `ordered` mode
- responses and explicit passes
- host advance
- monotonically increasing room revision
- command idempotency keys
- one model-turn claim per ready window

The coordinator, not model prompting, decides when the GM may answer. `all` waits for every required participant; `any` becomes ready after one response or pass; `ordered` waits for its active participant. Closed or stale-window submissions fail. Duplicate command IDs return the already-produced state and events.

The initial implementation is in process and single writer. It does not claim networking, authentication, presence, reconnection, durable compare-and-swap, or provider execution. A hosted adapter must add a trusted model-key boundary, expected-revision persistence, command idempotency, and an atomic claim or lease before it is multiplayer-safe across processes.

Ledger writer suffixes are diagnostic identity, not conflict resolution.

## Rejected alternatives

- One ever-growing Markdown world file: durable but increasingly unretrievable.
- Fully typed lore graph: too rigid and expensive to author.
- GeoJSON now: solves a cartography problem the first setting maps do not need.
- Portents-owned compaction: belongs to the agent framework once facts live outside transcript context.
- Prompt-only multiplayer etiquette: cannot prevent early or duplicate GM turns.
- Peer-to-peer multiwriter state: conflicts with ordered narrative turns and the existing single-writer storage contract.
