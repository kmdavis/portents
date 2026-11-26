# Portents roadmap

## Direction

Portents is the open-source engine and client/server ecosystem for persistent AI-assisted tabletop RPGs. Omens (working name, subject to brand clearance) is its official managed hosting service. Bring your own AI; Portents supplies the mechanics, content and durable campaign state, not hosted model inference.

This document captures product direction. GitHub issues track implementation and progress; accepted decisions under design/ specify technical contracts. The current repository may not yet implement everything described here.

## Product decisions

- One host-neutral engine and one shared authenticated server implementation, deployed locally, self-hosted or on the official shared host. Deployment-specific storage, identity and runtime concerns belong behind adapters. Clients use consistent interfaces regardless of endpoint.
- Every operation has an authenticated identity. A local installer provisions a user and secure credentials automatically; it must not bypass authorization. Local servers bind to loopback by default.
- Campaigns are server-authoritative, independent of conversation history. Support versioned, lossless export/import of campaign-owned state, including ledger, resources, sheets, maps, deck piles and pending actions. Preserve stable references to required content packs; never export credentials or redistribute restricted assets. No live synchronization in this phase.
- Preserve existing engine invariants and portable human-readable campaign formats. Use transactional commands, revisions and idempotency to prevent stale writes and duplicate rolls.
- CLI, pi, OMP/Tern and web are native clients. Preserve host lifecycle control and richer native presentation where supported. Keep the existing browser-only demo useful independently.
- ChatGPT and Claude use a reusable MCP interface and shared MCP Apps UI, with thin platform adapters and generated GM guidance. The consuming model is the GM. Validate actual platform behavior, including approvals, secrecy, skill activation, interactive rolls and distribution rules; do not promise unsupported parity.
- Keep local and self-hosted deployments free and usable with local models. Omens requires account registration for ownership and persistence; aim for free user access at launch and optional donations (Ko-fi or similar) on its independent website, subject to measured costs and platform rules.
- Design an entitlement seam for possible future hosted subscriptions and content purchases, but do not implement billing, paid restrictions or a marketplace now. Initially target Fly.io with the same Node/Docker server and SQLite adapter, persistent volume and independent backups; measure marginal costs before launch or monetizing. The maintainer's existing paid account does not make Omens hosting free; isolate its resources and credentials. Document capacity upgrades, single-volume availability limits and provider exit. Cloudflare is a deferred possible pivot, not an initial dependency.
- Multiplayer, live synchronization and hosted LLM inference are outside this release scope.

## Epics

| Epic | Deliverable | Child issues |
| --- | --- | --- |
| [#1](https://github.com/kmdavis/portents/issues/1) | Unified authenticated server and portable campaigns | #5–#11 |
| [#2](https://github.com/kmdavis/portents/issues/2) | Native CLI, pi, OMP/Tern and web clients | #12–#16 |
| [#3](https://github.com/kmdavis/portents/issues/3) | MCP and interactive ChatGPT/Claude plugins | #17–#23 |
| [#4](https://github.com/kmdavis/portents/issues/4) | Omens managed service | #24–#28 |

## Suggested initial sequence

1. [#5](https://github.com/kmdavis/portents/issues/5): document the unified server architecture.
2. [#17](https://github.com/kmdavis/portents/issues/17) and [#14](https://github.com/kmdavis/portents/issues/14): validate ChatGPT/Claude and OMP/Tern capabilities before locking down interfaces.
3. [#6](https://github.com/kmdavis/portents/issues/6), [#7](https://github.com/kmdavis/portents/issues/7), [#8](https://github.com/kmdavis/portents/issues/8): shared actions, identity and transactional storage.
4. [#9](https://github.com/kmdavis/portents/issues/9) through [#11](https://github.com/kmdavis/portents/issues/11): prove the local server, portability and interaction lifecycle.
5. Complete native clients, MCP integrations and Omens deployment according to actual dependencies and feasibility findings.

This is suggested sequencing, not a fixed schedule. Update design decisions and issue dependencies as evidence emerges. Package names, frameworks, database schemas and host-specific implementation details remain open until validated.

## Release bar

A player can create a campaign on one supported server, play through an authenticated client with auditable rolls and persistent state, resume in a new session, export the campaign and import it into another deployment without losing campaign-owned state. Hosted accounts are isolated, operational costs are measured and controlled, and supported plugins have documented limitations. Omens branding is cleared before public launch.
