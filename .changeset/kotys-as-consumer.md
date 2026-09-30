---
"@saystack/core": minor
"@saystack/server": minor
"@saystack/engine-openai-compatible": minor
"@saystack/react": minor
"@saystack/react-web": minor
"@saystack/react-native": minor
"@saystack/web": minor
---

Close the gaps a real app hit when wiring saystack in.

- `createVoiceRoutes`: `realtime.authorize(c)` checks a WebSocket before it opens (a refused one gets
  `BAD_TOKEN` and closes with 4001), `cors: false` leaves CORS to the app, `maxTextChars` refuses long text
  with 413 `TEXT_TOO_LONG`, and `/speech` hands the request's abort signal to the engine.
- A `language` hint now reaches batch transcription: `useDictation({ language })` sends it with the upload
  and to the live stream (it moved off `realtime.language`), the route reads it, and
  `ISttTranscribeInput.language` carries it to the engine.
- `listSpeechModels(engine)` lists a server's STT and TTS models, with streaming support where the server
  says. `createOmlxRealtimeSttAdapter` uses it to refuse a model that cannot stream at once.
- `useReadAloudMessage(id, ref, { zIndex })` and `createReadAlong({ zIndex })` place the read-along marks.
- `wordEntrance(ageMs)` from `@saystack/web` lets editors that render streamed words match the entrance.
- `useHoldToTalk` for the web, the twin of the react-native hook; `holdOutcome` and `isPastCancel` now
  live in `@saystack/react`.
