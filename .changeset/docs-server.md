---
"@saystack/server": patch
---

README: `engineBodyFields` on `createVoiceRoutes` — which caller fields may travel to the engine, the adapter keys held back, and `maxTextChars` counting the fields with the text. The `/voice/speech` route row now reads `{ text, fields? }`.
