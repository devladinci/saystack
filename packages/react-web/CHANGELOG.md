# @saystack/react-web

## 0.4.0

### Minor Changes

- 803527d: `useWebDictation` sends its `context` with the upload and in the live stream's `start` message. `realtime.finishTimeoutMs` sets how long a live dictation waits for its final text, for a server whose cleanup runs on a slow model.
- 2532b80: The player opens and closes its own height, so what sits around it moves over instead of jumping, and it stays on screen while it leaves. `--saystack-player-gap` is space under it that opens and closes with it. It fades in, shows an indeterminate track before the first chunk instead of an empty row, no longer pulses its status text, keeps its track inside its edge however many parts a reply has, and when narrow hides the skip buttons while a status is showing so the status has room. Its locate button asks the read-along for the word being read rather than centring the whole message. `useReadAlong` and `useReadAloudMessage` take `follow`, and `useFieldInput` passes `wait()` on, so dictated words shimmer until the final text lands.

### Patch Changes

- Updated dependencies [803527d]
- Updated dependencies [803527d]
- Updated dependencies [2532b80]
- Updated dependencies [2532b80]
- Updated dependencies [2532b80]
  - @saystack/core@0.4.0
  - @saystack/react@0.4.0
  - @saystack/web@0.4.0

## 0.3.0

### Minor Changes

- 3faf824: `ReadAloudProvider` takes `shouldSummarize`. `rewrite` now also runs for short replies with numbers, symbols or links, and `shouldRewrite` no longer decides when `summarize` runs.

### Patch Changes

- Updated dependencies [3faf824]
- Updated dependencies [3faf824]
  - @saystack/core@0.3.0
  - @saystack/react@0.3.0
  - @saystack/web@0.1.4

## 0.2.1

### Patch Changes

- 120b41a: README: the `styleMap` prop on `ReadAloudProvider` for the web, so a rewrite may answer with `{ text, style }` and have the style reach the speech route — as a field in the request body, or a tag in front of the text.
- Updated dependencies [120b41a]
- Updated dependencies [120b41a]
- Updated dependencies [120b41a]
  - @saystack/core@0.2.1
  - @saystack/react@0.2.1
  - @saystack/web@0.1.3

## 0.2.0

### Minor Changes

- ba1dbed: A rewrite can name a delivery style, and the app declares how it travels to the engine. `IStyleMap` holds the
  app's own vocabulary and one channel — extra body fields (`{ mode: "field", field: "instructions" }`) or a tag
  prefixed to the text (`{ mode: "tag", template: "<|emotion:{style}|>" }`) — and saystack ships no styles of its
  own. A style nobody declared is dropped rather than guessed at, and an undeclared or absent map speaks plain
  text exactly as before. The style reaches the engine as `fields` on `ITtsSynthesizeInput`, through
  `createHttpSynthesize` and `/voice/speech`.

### Patch Changes

- Updated dependencies [ba1dbed]
  - @saystack/core@0.2.0
  - @saystack/react@0.2.0
  - @saystack/web@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [b86fbbf]
- Updated dependencies [b86fbbf]
- Updated dependencies [b86fbbf]
  - @saystack/core@0.1.1
  - @saystack/react@0.1.1
  - @saystack/web@0.1.1

## 0.1.0

### Minor Changes

- 38c80d8: Initial release.

### Patch Changes

- Updated dependencies [38c80d8]
  - @saystack/core@0.1.0
  - @saystack/web@0.1.0
  - @saystack/react@0.1.0
