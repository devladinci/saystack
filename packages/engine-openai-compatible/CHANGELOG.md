# @saystack/engine-openai-compatible

## 0.1.3

### Patch Changes

- ba1dbed: A rewrite can name a delivery style, and the app declares how it travels to the engine. `IStyleMap` holds the
  app's own vocabulary and one channel — extra body fields (`{ mode: "field", field: "instructions" }`) or a tag
  prefixed to the text (`{ mode: "tag", template: "<|emotion:{style}|>" }`) — and saystack ships no styles of its
  own. A style nobody declared is dropped rather than guessed at, and an undeclared or absent map speaks plain
  text exactly as before. The style reaches the engine as `fields` on `ITtsSynthesizeInput`, through
  `createHttpSynthesize` and `/voice/speech`.
- Updated dependencies [ba1dbed]
  - @saystack/core@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies [b86fbbf]
  - @saystack/core@0.1.1

## 0.1.1

### Patch Changes

- No code changes. The same code as 0.1.0, published again while 0.1.0 looked stuck in staged publishing.

## 0.1.0

### Minor Changes

- 38c80d8: Initial release.

### Patch Changes

- Updated dependencies [38c80d8]
  - @saystack/core@0.1.0
