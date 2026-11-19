---
"@saystack/server": minor
---

`createVoiceRoutes` takes `cleanup`: a cleaner that tidies every transcript before it is sent back, on the upload route and at the end of a live one. The upload reads a `context` field and the live route's `start` message carries one. A cleanup that fails, is refused or takes longer than `timeoutMs` (4 seconds) leaves the transcript as it was heard, `onResult` reports each outcome, and `warmUp` wakes a local model when a live dictation starts. `createRealtimeBridge` takes `refine` for the same step, and stops it before the client's `waitMs` runs out.
