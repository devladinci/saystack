---
"@saystack/core": patch
---

`speechChunks` no longer shrinks its chunks to a letter each when room is reserved for a style tag. The reserve was taken off the grown limit at every step, so with a tag-channel style map a reply was split into hundreds of one-letter requests after its first few sentences; it now comes off each chunk once. `alignWords` finds the longest run of words the speech and the page share, so read-along keeps its place across a table read as sentences or a block the speech skips, however long; it falls back to the short look-ahead only for texts too long to compare in full. `MESSAGE_AURA_STYLE` is a crisper line with a shorter glow, and `IDictationInput` gains an optional `wait()`, called when the speaker stops and the final text is on its way.
