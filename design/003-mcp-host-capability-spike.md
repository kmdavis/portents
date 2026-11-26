# MCP host capability spike: ChatGPT and Claude

Status: spike report; not a production design

## Scope and setup

[Issue #17](https://github.com/kmdavis/portents/issues/17) asks whether a small remotely hosted, authenticated MCP server and dice widget work in ChatGPT and Claude, and what the real host limits are. On 2026-11-26, a temporary Node 24 MCP server was deployed at [the isolated Fly.io test endpoint](https://portents-mcp-spike-17-kmd.fly.dev). It contains no campaign data. It exposes an OAuth-protected MCP endpoint, a `d20` roll tool, and a small MCP App widget. Browser tests used the owner’s authenticated ChatGPT and Claude sessions. The app was moved from the personal Fly.io organization to `portents-hosting` after testing.

This was a capability probe, not a production security review or an implementation of the shared server in [decision 002](002-unified-server-and-client-architecture.md). Prototype files and test credentials were temporary and are not part of this repository; do not use the endpoint or its test account for real campaigns.

## Observations

| Capability | Observed result |
|---|---|
| Remote auth and endpoint | Both hosts connected to the public HTTPS endpoint using OAuth authorization. An unauthenticated request to `/mcp` returned HTTP 401; `/health` returned `ok` during verification. These checks establish this test configuration only. |
| Tool approval | Both hosts presented a user-visible approval prompt before the first `open_dice` call. The user selected one-time approval. Approval UX and wording differ by host. |
| Widget visibility | Both hosts opened the MCP App widget. The `open_dice` tool returned a pending status and did not roll. The test widget's explicit Roll action called the server-side dice tool; it was not a host-generated result. |
| Widget follow-up | A widget Continue action in ChatGPT reached the host, but the originating widget/session was no longer available to complete the follow-up. Reopening the widget worked. Claude could open the widget, but this spike did not establish a reliable persistent callback/follow-up lifecycle across reconnects. Do not claim that widget callbacks or durable pending actions work. |
| Skill activation | Claude loaded a temporary custom skill when prompted with its matching task, and returned its instructed phrase. ChatGPT's Plugin Creator skill loaded in Work mode and explained package layout. A temporary ChatGPT skill archive was not installed by the assistant because the archive-upload control could not be automated; the user then manually installed the temporary skill and confirmed activation with the instructed phrase. |
| Model-visible versus user-visible data | The model could report that the widget was open but could not retrieve the value shown only inside the widget; it said it did not know the value and did not invoke tools. This is one observation, not a security guarantee. Never rely on host UI separation for authorization or secrecy. |
| Mobile and distribution | Not tested on mobile. Official [Claude guidance](https://claude.com/docs/connectors/custom/add-unlisted) permits custom remote connectors by URL across Free, Pro, Max, Ultra, Team, and Enterprise plans; the [Claude directory](https://claude.com/docs/connectors/building/directory-vs-custom) is separately reviewed and controls discoverability. ChatGPT's [submission guidance](https://developers.openai.com/plugins/deploy/submission) requires a public HTTPS MCP endpoint, domain verification, automated checks, and review before directory publication. Private custom-connector success is not a mobile or publication test. |
| Custom endpoint | Both hosts accepted the privately configured remote test server. This does not demonstrate public listing, arbitrary endpoint support in every plan/surface, or stable future compatibility. |

## Limits and implications

- The test server is disposable and unsuitable for campaigns: authentication storage was in-memory SQLite, the single test account was seeded for the probe, and there is no durable campaign store, account lifecycle, backup, revocation exercise, monitoring, or production security review.
- The endpoint's OAuth and tool flow prove a narrow connection path, not the identity, ownership, authorization, transaction, or privacy contracts in decision 002.
- A server tool annotation, one-time approval prompt, widget display, or absent model-visible value does not prove user intent, callback reliability, or model/widget privilege isolation.
- Host-specific approvals, UI behavior, timeouts, reconnects, skill packaging, and distribution can change. Test on the intended plan and device before making support claims.
- The actual callback result was incomplete in ChatGPT, and durable roll confirmation was not demonstrated in either host. Keep interactive actions pending until a supported, authenticated continuation succeeds; never auto-roll to work around host limitations.
- The deployable prototype remains outside the repository; this report records observed results, not a reproducible build. Recreate it only as an explicitly scoped follow-up with reviewed credentials and durable isolation.

## Next steps

Use these findings to inform [#18](https://github.com/kmdavis/portents/issues/18), [#20](https://github.com/kmdavis/portents/issues/20), and [#21](https://github.com/kmdavis/portents/issues/21): keep MCP bindings thin, require explicit approval for state-changing gameplay, and treat widget callbacks and data exposure as host-specific capabilities. Repeat the unsupported callback, mobile, and distribution trials before promising them. The shared server and persistent roll lifecycle remain owned by [#9](https://github.com/kmdavis/portents/issues/9) and [#11](https://github.com/kmdavis/portents/issues/11).
