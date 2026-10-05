# @saystack/engine-openai-compatible

A saystack engine for any server that speaks the OpenAI `/v1` endpoints: speech-to-text, text-to-speech, live
dictation, and rewriting replies for speech. Run it on your server, usually behind `@saystack/server`, so tokens
never reach the client.

## Install

```bash
npm install @saystack/engine-openai-compatible
```

No peer dependencies. It needs Node 22 or newer.

## Adapters

| Feature              | Endpoint                               | Adapter                                              |
| -------------------- | -------------------------------------- | ---------------------------------------------------- |
| Dictation (upload)   | `POST /v1/audio/transcriptions`        | `createOpenAiSttAdapter`                             |
| Read aloud           | `POST /v1/audio/speech`                | `createOpenAiTtsAdapter`                             |
| Live dictation       | `WS /v1/realtime?intent=transcription` | `createOpenAiRealtimeSttAdapter`                     |
| Live dictation, oMLX | `WS /v1/audio/transcriptions/realtime` | `createOmlxRealtimeSttAdapter` (oMLX's own protocol) |
| Speech rewriting     | `POST /v1/chat/completions`            | `createLlmNormalizer`                                |

`listSpeechModels` lists the speech models a server offers.

## Usage

```ts
import { readFile } from "node:fs/promises";

import {
  createLlmNormalizer,
  createOmlxRealtimeSttAdapter,
  createOpenAiRealtimeSttAdapter,
  createOpenAiSttAdapter,
  createOpenAiTtsAdapter,
  maxAudioTokens,
} from "@saystack/engine-openai-compatible";

const openai = { url: "https://api.openai.com/v1", token: process.env.OPENAI_API_KEY ?? "" };

const tts = createOpenAiTtsAdapter({ ...openai, model: "gpt-4o-mini-tts" }, { voice: "marin" });
const stt = createOpenAiSttAdapter({ ...openai, model: "gpt-transcribe" });
const live = createOpenAiRealtimeSttAdapter(openai, { model: "gpt-live-transcribe" });
const rewrite = createLlmNormalizer({ ...openai, model: "gpt-6-luna" });

const speech = await tts.synthesize({ text: "The build passed." });
const heard = await stt.transcribe({ audio: await readFile("question.wav"), mimeType: "audio/wav" });
const spoken = await rewrite("| Step | Time |\n| --- | --- |\n| Test | 30s |", ["en"]);

const omlx = "http://127.0.0.1:7777/v1";
const localTts = createOpenAiTtsAdapter({ url: omlx, model: "higgs_audio_v3-tts-4b" }, { maxTokens: maxAudioTokens });
const localLive = createOmlxRealtimeSttAdapter({ url: omlx, model: "whisper-large-v3-turbo" });
```

Every call resolves to `{ ok: true, ... }` or `{ ok: false, errorCode, message }` instead of throwing. On success,
`speech.audio` is a WAV `ArrayBuffer`, `heard.text` is the transcript and `spoken.normalizedText` is the reply
rewritten for speech. The realtime adapters plug into `realtime.createAdapter` in `@saystack/server`.

- OpenAI requires a `voice`. Servers that pick the voice from the model can go without one.
- `maxTokens: maxAudioTokens` caps the audio tokens of each request by the length of the text. It is opt-in and
  not part of the OpenAI API; use it for servers such as oMLX whose models can run on.
- Each adapter takes its own URL, token and model, so speech and rewriting can live on different servers.
- The OpenAI Realtime adapter is tested against a fake server that follows OpenAI's published protocol. It has
  not yet been run against OpenAI itself. Speaches 0.1 speaks an older version of that protocol, so use upload
  dictation with Speaches for now.

## Speech rewriting

`createLlmNormalizer` rewrites a reply in its own language and never translates it. Numbers stay in digits, exactly
as written, while currency, percent, units, ranges and links become words, so `4,2%` is read as `4,2 процента`. A
rewrite that changes, adds or leaves out a number, or switches to another writing system, comes back as
`NORMALIZE_BAD_RESPONSE`, and the reply is read as written instead. The `languages` you pass are a hint about which
languages to expect, not a target. The prompt spells out the answer's JSON shape as well as sending it as
`response_format`, so servers that ignore structured output, such as Ollama's cloud models, work too.

## Delivery style

`createLlmNormalizer` rewrites a reply for the ear, and a reply can carry a delivery style with it. Offer the
styles a model may choose from and it names one in a field of its own, rather than writing the style word into
the spoken text:

```ts
const openai = { url: "https://api.openai.com/v1", token: process.env.OPENAI_API_KEY ?? "" };

const rewrite = createLlmNormalizer({
  ...openai,
  model: "gpt-6-luna",
  styleChoices: ["amused", "enthusiastic", "thoughtful"],
});

const spoken = await rewrite("## Release\n\nThe build **passed**.", ["en"]);
// spoken.ok, spoken.normalizedText — and spoken.style, when the model named one of the choices
```

The choices are added to the JSON schema the model answers with, and the field is required, so a model is not
free to skip it — a style left optional is one a small model tends to skip by writing the style word into the
text instead. With no `styleChoices`, the request has no style field at all and a style the model invents anyway
is ignored. saystack ships no style vocabulary: the choices are the labels of the caller's own style map, as in
the [core README](../core#delivery-style), and the chosen style travels from there.

A style the model returns reaches the engine when the server forwards it: `/voice/speech` sends the caller's
`fields` on to the adapter only for the keys an operator listed in `engineBodyFields`, and the adapter writes
them into the request body ahead of its own keys — so a field can add to the request, never replace the model,
the input or the response format. Field names the adapter owns are refused even if an operator lists them.

## Related packages

[`@saystack/core`](https://www.npmjs.com/package/@saystack/core),
[`@saystack/server`](https://www.npmjs.com/package/@saystack/server),
[`@saystack/react-web`](https://www.npmjs.com/package/@saystack/react-web),
[`@saystack/react-native`](https://www.npmjs.com/package/@saystack/react-native).
See the [saystack README](https://github.com/devladinci/saystack#readme) for how they fit together.

## License

MIT
