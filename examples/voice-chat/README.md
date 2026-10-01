# Voice chat example

A small chat that uses every saystack part against real engines: dictation into the composer, a reply from a
chat model, and the reply read aloud with read-along, the aura and the player.

It runs on OpenAI by default, so one API key is enough:

```bash
pnpm install && pnpm -r build
ENGINE_TOKEN=sk-… pnpm --filter @saystack/example-voice-chat dev
```

Then open http://localhost:5180.

## Other servers

`ENGINE` picks a preset, and every variable below overrides it. Any server that speaks the OpenAI endpoints works.

| Preset             | Speech server               | STT / TTS models                                    | Live dictation                         | Chat                            |
| ------------------ | --------------------------- | --------------------------------------------------- | -------------------------------------- | ------------------------------- |
| `openai` (default) | `https://api.openai.com/v1` | `gpt-transcribe` / `gpt-4o-mini-tts`, voice `marin` | OpenAI Realtime, `gpt-live-transcribe` | `gpt-6-luna` on the same key    |
| `omlx`             | `http://127.0.0.1:7777/v1`  | `whisper-large-v3-turbo` / `higgs_audio_v3-tts-4b`  | oMLX's own realtime protocol           | set `LLM_MODEL` (and `LLM_URL`) |

For example, speech on a local oMLX and chat on Ollama Cloud:

```bash
ENGINE=omlx ENGINE_TOKEN=… LLM_URL=https://ollama.com/v1 LLM_TOKEN=… LLM_MODEL=… \
  pnpm --filter @saystack/example-voice-chat dev
```

Model names change; check your provider's current list if a default is refused.

| Variable            | Default                          |
| ------------------- | -------------------------------- |
| `ENGINE`            | `openai`                         |
| `ENGINE_URL`        | the preset's server              |
| `ENGINE_TOKEN`      | none                             |
| `STT_MODEL`         | the preset's                     |
| `TTS_MODEL`         | the preset's                     |
| `TTS_VOICE`         | the preset's (`marin` on OpenAI) |
| `REALTIME_PROTOCOL` | the preset's: `openai` or `omlx` |
| `REALTIME_MODEL`    | the preset's, else `STT_MODEL`   |
| `LLM_URL`           | `ENGINE_URL`                     |
| `LLM_TOKEN`         | `ENGINE_TOKEN`                   |
| `LLM_MODEL`         | the preset's                     |
| `LANGUAGES`         | `en` (comma-separated)           |
| `PORT` / `API_PORT` | `5180` / `5181`                  |
