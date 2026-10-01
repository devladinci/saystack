---
"@saystack/react": patch
---

Dictation keeps both `language` and `durationSeconds` from the server's answer. Before, `durationSeconds` was dropped
whenever `language` was present.
