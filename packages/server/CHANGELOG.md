# @saystack/server

## 0.4.0

### Minor Changes

- 803527d: `createVoiceRoutes` takes `cleanup`: a cleaner that tidies every transcript before it is sent back, on the upload route and at the end of a live one. The upload reads a `context` field and the live route's `start` message carries one. A cleanup that fails, is refused or takes longer than `timeoutMs` (4 seconds) leaves the transcript as it was heard, `onResult` reports each outcome, and `warmUp` wakes a local model when a live dictation starts. `createRealtimeBridge` takes `refine` for the same step, and stops it before the client's `waitMs` runs out.
- 2532b80: `createRollingRealtimeSttAdapter` gives live words from an engine that only takes whole files: the audio since the last pause is transcribed again every half second, and a word is passed on once two passes in a row agree on it. Nothing is sent while the speaker is silent.

  With a final pass, the recording is what a live dictation's text comes from, whatever the stream does. A stream that fails no longer fails the dictation, the stream is closed as soon as the speaker stops instead of being waited on to flush, and if the final pass fails the words streamed so far are the text.

### Patch Changes

- Updated dependencies [803527d]
- Updated dependencies [2532b80]
  - @saystack/core@0.4.0

## 0.1.4

### Patch Changes

- Updated dependencies [3faf824]
  - @saystack/core@0.3.0

## 0.1.3

### Patch Changes

- 120b41a: README: `engineBodyFields` on `createVoiceRoutes` — which caller fields may travel to the engine, the adapter keys held back, and `maxTextChars` counting the fields with the text. The `/voice/speech` route row now reads `{ text, fields? }`.
- Updated dependencies [120b41a]
  - @saystack/core@0.2.1

## 0.1.2

### Patch Changes

- ba1dbed: A rewrite can name a delivery style, and the app declares how it travels to the engine. `IStyleMap` holds the
  app's own vocabulary and one channel — extra body fields (`{ mode: "field", field: "instructions" }`) or a tag
  prefixed to the text (`{ mode: "tag", template: "<|emotion:{style}|>" }`) — and saystack ships no styles of its
  own. A style nobody declared is dropped rather than guessed at, and an undeclared or absent map speaks plain
  text exactly as before. The style reaches the engine as `fields` on `ITtsSynthesizeInput`, through
  `createHttpSynthesize` and `/voice/speech`.
- Updated dependencies [ba1dbed]
  - @saystack/core@0.2.0

## 0.1.1

### Patch Changes

- b86fbbf: `maxBodyBytes` now counts the bytes that arrive, not only the `content-length` the client declares, so a chunked or
  multipart upload can no longer go past it.
- Updated dependencies [b86fbbf]
  - @saystack/core@0.1.1

## 0.1.0

### Minor Changes

- 38c80d8: Initial release.

### Patch Changes

- Updated dependencies [38c80d8]
  - @saystack/core@0.1.0
