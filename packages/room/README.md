# @portents/room

Experimental, transport-neutral coordination for several humans playing with one AI GM.

This package is deliberately **not a multiplayer server**. It defines the versioned room state and pure readiness rules first. The initial coordinator is in-process and single-writer. A hosted adapter still needs authentication, durable revisions, command idempotency, a model-turn lease, reconnect handling, and a trusted place for the model key and GM-private state.

Solo play is the one-participant case. It uses the same response-window rules rather than a second implementation.

```ts
import { responseWindowReady } from "@portents/room";

responseWindowReady({
  id: "round-4",
  request: { id: "intent-4", prompt: "What do you each do?" },
  mode: "all",
  requiredParticipantIds: ["alice", "ben"],
  responses: [
    { participantId: "alice", kind: "response", body: "I bar the door." },
    { participantId: "ben", kind: "pass" },
  ],
  status: "collecting",
}); // true
```

`all` waits for everyone required, `any` waits for one response or pass, and `ordered` waits for its active participant. A host may explicitly advance a window; silence never advances it automatically.
