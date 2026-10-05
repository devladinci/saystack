---
"@saystack/core": minor
---

A speech session now asks its `rewrite` for any reply a voice can't read as written — one with numbers, symbols, links, code or a table (`needsRewrite`, now exported) — instead of only for long replies, code and tables. Plain sentences are still read as written, without a model call. `toSpeechText` reads a link as its domain instead of dropping it, keeps a year that starts a line, keeps angle brackets that are not HTML tags (`Array<string>`, `x < y`) and drops emoji.
