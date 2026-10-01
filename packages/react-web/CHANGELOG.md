# @saystack/react-web

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
