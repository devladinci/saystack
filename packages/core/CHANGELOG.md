# @saystack/core

## 0.3.0

### Minor Changes

- 3faf824: A speech session now asks its `rewrite` for any reply a voice can't read as written — one with numbers, symbols, links, code or a table (`needsRewrite`, now exported) — instead of only for long replies, code and tables. Plain sentences are still read as written, without a model call. `toSpeechText` reads a link as its domain instead of dropping it, keeps a year that starts a line, keeps angle brackets that are not HTML tags (`Array<string>`, `x < y`) and drops emoji.

## 0.2.1

### Patch Changes

- 120b41a: README: the delivery style a rewrite can name — `IStyleMap`, the three channels a style may travel on, matching by `value` or label, and what a tag channel costs (room reserved in each chunk, word timings shifted back onto the words).

## 0.2.0

### Minor Changes

- ba1dbed: A rewrite can name a delivery style, and the app declares how it travels to the engine. `IStyleMap` holds the
  app's own vocabulary and one channel — extra body fields (`{ mode: "field", field: "instructions" }`) or a tag
  prefixed to the text (`{ mode: "tag", template: "<|emotion:{style}|>" }`) — and saystack ships no styles of its
  own. A style nobody declared is dropped rather than guessed at, and an undeclared or absent map speaks plain
  text exactly as before. The style reaches the engine as `fields` on `ITtsSynthesizeInput`, through
  `createHttpSynthesize` and `/voice/speech`.

## 0.1.1

### Patch Changes

- b86fbbf: `createSpectrumAnalyser` reports digital silence as -200 dB instead of `-Infinity`, and the aura renderer frees its
  vertex buffer on `dispose()`.

## 0.1.0

### Minor Changes

- 38c80d8: Initial release.
