# @saystack/server

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
