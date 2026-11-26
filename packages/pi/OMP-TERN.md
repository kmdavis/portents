# OMP and Tern capability spike

[Issue #14](https://github.com/kmdavis/portents/issues/14) investigates host capabilities for [#15](https://github.com/kmdavis/portents/issues/15); it does not implement a server-backed client. Observations below are specific to Windows, OMP 19.2.1 and Tern 0.9.35 (`ccfae03`). They are not promises for other versions, platforms or terminal hosts.

## Findings

| Area | Evidence and constraint | Direction for #15 |
| --- | --- | --- |
| Extension loading and lifecycle | The existing pi extension loaded in OMP headless RPC after building its workspace dependencies; `get_available_commands` returned `/roll`, `/portents`, `/portents-status`, `/sheet`, `/draw`, and `/oracle`. A separate extension's `session_start` set a widget. This does not prove gameplay or lifecycle parity. OMP documents `session_start`, `before_agent_start`, session switches and compaction hooks in its [extension API](https://github.com/can1357/oh-my-pi/blob/main/docs/extensions.md); the pi adapter currently uses `session_start` and `before_agent_start`. | Use native lifecycle hooks, test campaign resume and prompt injection against the actual server-backed adapter, and do not assume every pi API is compatible. OMP discovers its own extension roots; explicit `-e` was used here. |
| Semantic UI | A separate `ctx.ui.custom` semantic view completed its callback using keyboard input in Tern. OMP documents retained semantic nodes and a plain-terminal renderer in its [TUI integration guide](https://github.com/can1357/oh-my-pi/blob/main/docs/tui.md). | Prefer supported semantic nodes, not arbitrary HTML. Keep a text/ASCII presentation for ordinary terminals and headless hosts. |
| Graphical maps | The operator observed the probe's simple inline SVG map in Tern. This was not a Portents-generated map, fog-of-war check, image asset, or a test of another terminal. | Use the canonical engine map and player-safe projection; validate real maps, visibility and terminal fallbacks in #15. Never make graphics the sole representation. |
| Dialog callbacks | A confirmation probe returned `true` and updated the widget. The semantic view also completed after keyboard input. Cancellation, disconnect and actual player-roll persistence were not tested. | Ask for explicit player confirmation. An unavailable or interrupted dialog must not automatically roll or invent a result; durable lifecycle belongs to [#11](https://github.com/kmdavis/portents/issues/11). |
| Persistent panels | A `session_start` widget was visible and remained available after confirmation changed its contents. This proves an in-session widget, not persistence across restart or session switch. | Rehydrate panel contents from authoritative server state on session changes; do not treat widget state as durable campaign state. |

The pi adapter still opens local storage directly. Its current pending-roll sequence and `ctx.hasUI` check are not the future authenticated, atomic server lifecycle. The OMP UI guide says RPC may have `hasUI` while `custom()` is unsupported, and headless mode has no interactive UI. Test each required operation in its actual host rather than using `hasUI` as a universal capability check. No model was invoked in this spike.

## Reproduce the interactive probe

Run in a disposable Tern session from the repository root with OMP installed. The extension is isolated from automatic extension, skill, rule and context-file discovery; it does not touch campaign state:

```sh
omp --no-session --no-extensions --no-skills --no-rules --no-context-files -e manual/omp-tern-spike.ts
```

- `/spike-confirm`: answer the confirmation; the panel and notification report the answer.
- `/spike-card`: use keyboard focus and activate the button; the callback notification appears.
- `/spike-map`: inspect the SVG map; press a key to close it.

`tern capture --surfaces` did not expose the interactive SVG surface in this trial. Inspect the visible surface rather than treating an empty capture as rendering failure. Recheck after host upgrades. The simple SVG is test artwork, not a game result or canonical map.

## Remaining verification for implementation

The spike did not test model execution, all pi tools, remote authentication, actual Portents map rendering, player projections, restart/resume, mobile, accessibility, other OSes, or non-Tern graphics. #15 must test its real client and supported fallbacks after the shared client/server prerequisites land. A Windows checkout with `core.autocrlf=true` can turn Greywater source resources into CRLF; its resource generator rejects them. This affected the full workspace build, not the targeted dependency build or the host probe.
