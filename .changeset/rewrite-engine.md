---
"@saystack/engine-openai-compatible": minor
---

`createLlmNormalizer` keeps a reply in its own language and keeps its numbers. The prompt asks for the same language and for numbers in digits, exactly as written; `languages` is a hint, no longer a list the answer must pick from. A rewrite that changes, adds or leaves out a number, or switches to another writing system, comes back as `NORMALIZE_BAD_RESPONSE`, so the reply is read as written. The prompt also spells out the answer's JSON shape, so servers that ignore `response_format`, such as Ollama's cloud models, no longer fail every rewrite.
