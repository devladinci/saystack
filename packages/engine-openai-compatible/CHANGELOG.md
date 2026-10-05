# @saystack/engine-openai-compatible

## 0.2.0

### Minor Changes

- 3faf824: `createLlmNormalizer` keeps a reply in its own language and keeps its numbers. The prompt asks for the same language and for numbers in digits, exactly as written; `languages` is a hint, no longer a list the answer must pick from. A rewrite that changes, adds or leaves out a number, or switches to another writing system, comes back as `NORMALIZE_BAD_RESPONSE`, so the reply is read as written. The prompt also spells out the answer's JSON shape, so servers that ignore `response_format`, such as Ollama's cloud models, no longer fail every rewrite.

### Patch Changes

- Updated dependencies [3faf824]
  - @saystack/core@0.3.0

## 0.1.4

### Patch Changes

- 120b41a: README: `styleChoices` on `createLlmNormalizer` — the style field it adds to the response schema, why it is required, and how the caller’s `fields` reach the request body.
- Updated dependencies [120b41a]
  - @saystack/core@0.2.1

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
