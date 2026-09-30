---
"@saystack/core": minor
"@saystack/engine-openai-compatible": minor
"@saystack/web": patch
"@saystack/react-native": patch
---

Make the engine vendor-neutral.

- Renamed `createOmlxSttAdapter` to `createOpenAiSttAdapter`, `createOmlxTtsAdapter` to `createOpenAiTtsAdapter`
  and `IOmlxSttOptions` to `IOpenAiSttOptions`. `createOmlxRealtimeSttAdapter` keeps its name: it speaks oMLX's
  own protocol.
- `stt.model` and `tts.model` are now required, like `llm.model`. The adapters no longer fall back to oMLX's
  models, and the STT adapter no longer claims Parakeet's language list; pass `languages` to declare one.
- New `createOpenAiRealtimeSttAdapter` for live dictation over the OpenAI Realtime transcription protocol.
- New `REALTIME_PCM_RATE` in core: the realtime stream is always 16 kHz PCM16, and adapters resample.
