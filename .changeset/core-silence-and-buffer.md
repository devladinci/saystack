---
"@saystack/core": patch
---

`createSpectrumAnalyser` reports digital silence as -200 dB instead of `-Infinity`, and the aura renderer frees its
vertex buffer on `dispose()`.
