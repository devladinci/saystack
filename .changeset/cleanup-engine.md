---
"@saystack/engine-openai-compatible": minor
---

`createLlmTranscriptCleaner` cleans up a dictated transcript with any OpenAI-compatible chat model: punctuation, filler sounds, repeats, self-corrections and slips of grammar, in the transcript's own language. Given the conversation's `context` or a `vocabulary`, it writes a misheard name or term the way they spell it. A question is cleaned, not answered: every answer is compared word by word with what was heard, and one that lost a passage, added words, numbers or currency signs, or took more than a few terms from the context comes back as `CLEANUP_REJECTED` after one retry. `disableThinking` now also sends `reasoning_effort: "none"`, which is what switches thinking off on Ollama; before, a thinking model on Ollama thought through every rewrite.
