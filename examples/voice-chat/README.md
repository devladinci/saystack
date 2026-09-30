# Voice chat example

A small chat that uses every saystack part against real engines: dictation into the composer, a reply from a
chat model, and the reply read aloud with read-along, the aura and the player.

It expects an OpenAI-compatible speech server for speech-to-text and text-to-speech (defaults point at a
local oMLX), and an OpenAI-compatible chat endpoint (Ollama Cloud by default) for replies and for rewriting
long replies for speech. Live dictation speaks oMLX's realtime protocol by default; set
`REALTIME_PROTOCOL=openai` for servers that speak the OpenAI Realtime protocol.

```bash
pnpm install && pnpm -r build
ENGINE_TOKEN=… LLM_TOKEN=… pnpm --filter @saystack/example-voice-chat dev
```

Then open http://localhost:5180.

| Variable            | Default                    |
| ------------------- | -------------------------- |
| `ENGINE_URL`        | `http://127.0.0.1:7777/v1` |
| `ENGINE_TOKEN`      | none                       |
| `STT_MODEL`         | `whisper-large-v3-turbo`   |
| `TTS_MODEL`         | `higgs_audio_v3-tts-4b`    |
| `REALTIME_PROTOCOL` | `omlx` (or `openai`)       |
| `REALTIME_MODEL`    | `STT_MODEL`                |
| `LLM_URL`           | `https://ollama.com/v1`    |
| `LLM_TOKEN`         | none                       |
| `LLM_MODEL`         | `deepseek-v4.1-flash`      |
| `PORT` / `API_PORT` | `5180` / `5181`            |
