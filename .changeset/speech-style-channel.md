---
"@saystack/core": minor
"@saystack/react": minor
"@saystack/react-web": minor
"@saystack/react-native": minor
"@saystack/server": patch
"@saystack/engine-openai-compatible": patch
---

A rewrite can name a delivery style, and the app declares how it travels to the engine. `IStyleMap` holds the
app's own vocabulary and one channel — extra body fields (`{ mode: "field", field: "instructions" }`) or a tag
prefixed to the text (`{ mode: "tag", template: "<|emotion:{style}|>" }`) — and saystack ships no styles of its
own. A style nobody declared is dropped rather than guessed at, and an undeclared or absent map speaks plain
text exactly as before. The style reaches the engine as `fields` on `ITtsSynthesizeInput`, through
`createHttpSynthesize` and `/voice/speech`.
