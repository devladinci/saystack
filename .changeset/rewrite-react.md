---
"@saystack/react": minor
---

`createReadAloud` gives a summary and a rewrite their own triggers: `summarize` runs for a reply with code, a table or a lot of text (`shouldSummarize`, default `needsSummary`), and `rewrite` for any other reply a voice can't read as written (`shouldRewrite`, default `needsRewrite`). Before, both waited for the summary's trigger, so short replies with numbers were never rewritten.
