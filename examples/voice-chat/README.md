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
| `omlx`             | `http://127.0.0.1:7777/v1`  | `whisper-large-v3-turbo` / `higgs_audio_v3-tts-4b`  | rolling passes of the STT model        | set `LLM_MODEL` (and `LLM_URL`) |

For example, speech on a local oMLX and chat on Ollama Cloud:

```bash
ENGINE=omlx ENGINE_TOKEN=… LLM_URL=https://ollama.com/v1 LLM_TOKEN=… LLM_MODEL=… \
  pnpm --filter @saystack/example-voice-chat dev
```

Model names change; check your provider's current list if a default is refused.

`REALTIME_PROTOCOL` picks where the live words come from. `openai` and `omlx` open that server's realtime
stream. `rolling` needs no realtime endpoint: the server sends the audio since the last pause to `STT_MODEL`
every half second and shows the words two passes agree on, so any model that takes a file can dictate live,
such as Parakeet on oMLX. The oMLX preset uses it because oMLX's Whisper stream stops sending words when it
revises a sentence and makes words up from silence.

Dictated words are cleaned up by the chat model before they settle in the composer: fillers and repeats go, and
the last messages of the chat are sent along as context, so a misheard `peer` becomes the `PR` you were talking
about. The server logs what it heard and what it sent. `VOCABULARY` adds your own names and terms, and
`CLEANUP=off` shows the transcripts as they were heard.

| Variable             | Default                                                     |
| -------------------- | ----------------------------------------------------------- |
| `ENGINE`             | `openai`                                                    |
| `ENGINE_URL`         | the preset's server                                         |
| `ENGINE_TOKEN`       | none                                                        |
| `STT_MODEL`          | the preset's                                                |
| `TTS_MODEL`          | the preset's                                                |
| `TTS_VOICE`          | the preset's (`marin` on OpenAI)                            |
| `SPEECH_STYLES`      | the preset's; `off` for a voice that reads no style tags    |
| `REALTIME_PROTOCOL`  | the preset's: `openai`, `omlx` or `rolling`                 |
| `REALTIME_MODEL`     | the preset's, else `STT_MODEL`; `rolling` has no use for it |
| `LLM_URL`            | `ENGINE_URL`                                                |
| `LLM_TOKEN`          | `ENGINE_TOKEN`                                              |
| `LLM_MODEL`          | the preset's                                                |
| `LANGUAGES`          | `en` (comma-separated)                                      |
| `CLEANUP`            | on; `off` leaves transcripts raw                            |
| `CLEANUP_TIMEOUT_MS` | `4000` on OpenAI, else `8000`                               |
| `VOCABULARY`         | none (comma-separated)                                      |
| `PORT` / `API_PORT`  | `5180` / `5181`                                             |
