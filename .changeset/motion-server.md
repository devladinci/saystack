---
"@saystack/server": minor
---

`createRollingRealtimeSttAdapter` gives live words from an engine that only takes whole files: the audio since the last pause is transcribed again every half second, and a word is passed on once two passes in a row agree on it. Nothing is sent while the speaker is silent.

With a final pass, the recording is what a live dictation's text comes from, whatever the stream does. A stream that fails no longer fails the dictation, the stream is closed as soon as the speaker stops instead of being waited on to flush, and if the final pass fails the words streamed so far are the text.
