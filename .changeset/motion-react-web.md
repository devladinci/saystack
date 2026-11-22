---
"@saystack/react-web": minor
---

The player opens and closes its own height, so what sits around it moves over instead of jumping, and it stays on screen while it leaves. `--saystack-player-gap` is space under it that opens and closes with it. It fades in, shows an indeterminate track before the first chunk instead of an empty row, no longer pulses its status text, keeps its track inside its edge however many parts a reply has, and when narrow hides the skip buttons while a status is showing so the status has room. Its locate button asks the read-along for the word being read rather than centring the whole message. `useReadAlong` and `useReadAloudMessage` take `follow`, and `useFieldInput` passes `wait()` on, so dictated words shimmer until the final text lands.
