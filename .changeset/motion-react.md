---
"@saystack/react": patch
---

`useDictation` calls its input's `wait()` once the speaker stops, when words were streamed into it.
