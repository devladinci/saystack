---
"@saystack/core": minor
---

`ICleanupFn` is the contract for cleaning up a dictated transcript: it takes what was heard with the conversation's `context`, a `vocabulary` and the `languages` to expect, and answers the cleaned text or a coded failure. `needsCleanup` says whether a transcript shows the marks of speech (filler sounds, a word said twice, no capitals or sentence ends, a long dictation), and `conversationContext` turns the end of a chat into the context a cleaner reads. `startLiveTranscription` takes a `context` and sends it in the `start` message, and its `stop` message now carries `waitMs`, how long it will wait for the final text.
