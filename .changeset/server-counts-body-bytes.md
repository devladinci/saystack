---
"@saystack/server": patch
---

`maxBodyBytes` now counts the bytes that arrive, not only the `content-length` the client declares, so a chunked or
multipart upload can no longer go past it.
