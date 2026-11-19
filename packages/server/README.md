# @saystack/server

Hono routes for voice: transcription, speech and a live dictation socket. They keep engine tokens on your server
and answer with fixed error codes. Mount them on any Hono app and point the saystack components at them.

## Install

```bash
npm install @saystack/server hono
```

No peer dependencies. The example below also uses `@saystack/core`, `@saystack/engine-openai-compatible` and
`@hono/node-server`.

## Usage

```ts
import { serve } from "@hono/node-server";
import { validateConfig } from "@saystack/core";
import { createOpenAiSttAdapter, createOpenAiTtsAdapter } from "@saystack/engine-openai-compatible";
import { createVoiceRoutes } from "@saystack/server";
import { Hono } from "hono";

const url = "https://api.openai.com/v1";
const token = process.env.OPENAI_API_KEY ?? "";
const settings = validateConfig({
  languages: ["en"],
  stt: { url, token, model: "gpt-transcribe" },
  tts: { url, token, model: "gpt-4o-mini-tts" },
});

if (!settings.ok) {
  throw new Error(settings.errors.map((error) => error.message).join("\n"));
}

const app = new Hono();

app.route(
  "/voice",
  createVoiceRoutes({
    getSettings: () => settings,
    createSttAdapter: (engine) => createOpenAiSttAdapter(engine),
    createTtsAdapter: (engine) => createOpenAiTtsAdapter(engine, { voice: "marin" }),
  }),
);

serve({ fetch: app.fetch, port: 3000 });
```

| Route                                      | What it does                                                  |
| ------------------------------------------ | ------------------------------------------------------------- |
| `GET /voice/capabilities`                  | What the speech-to-text engine supports                       |
| `POST /voice/audio/transcriptions`         | Audio as a multipart `file` or a raw body, returns `{ text }` |
| `POST /voice/speech`                       | `{ text, fields? }` as JSON, returns audio                    |
| `GET /voice/audio/transcriptions/realtime` | Live dictation over a WebSocket, when `realtime` is set       |

Failures come back as JSON with an `errorCode` and a matching HTTP status. `getSettings` runs on every request,
so settings can change while the server runs. Other options: `maxBodyBytes`, `maxTextChars`, and `cors` (any
origin by default, `false` to leave CORS to your app).

## Delivery style

`/voice/speech` accepts the caller's extra engine body fields alongside the text — `{ text, fields }` — and
forwards them only when an operator names them. That is the `createVoiceRoutes` call above, with one option added:

```ts
createVoiceRoutes({
  getSettings: () => settings,
  createSttAdapter: (engine) => createOpenAiSttAdapter(engine),
  createTtsAdapter: (engine) => createOpenAiTtsAdapter(engine, { voice: "marin" }),
  engineBodyFields: ["instructions"],
});
```

`engineBodyFields` is empty by default, so a client cannot set an engine field the operator did not open. Names
the adapter owns (`model`, `input`, `response_format`, `voice`, `ref_audio`, `ref_text`, `max_tokens`) are held
back even if they are listed. This is how a rewrite's delivery style reaches the engine: the caller's style map
decides the key, and the operator decides whether it may travel. Each value has to be a string, and `maxTextChars`
counts the field names and values along with the text, so a chunk that was sized to fit under the limit is not
refused once its fields are attached.

## Live dictation

```ts
import { upgradeWebSocket } from "@hono/node-server";
import { createOpenAiRealtimeSttAdapter } from "@saystack/engine-openai-compatible";
import type { IRealtimeRouteDeps } from "@saystack/server";

export const realtime: IRealtimeRouteDeps = {
  upgradeWebSocket,
  createAdapter: (engine) => createOpenAiRealtimeSttAdapter(engine, { model: "gpt-live-transcribe" }),
};
```

Pass it as `createVoiceRoutes({ ..., realtime })`. On Node, `serve` also needs a WebSocket server from `ws`, as in
[`examples/voice-chat/server.ts`](https://github.com/devladinci/saystack/blob/main/examples/voice-chat/server.ts).
Browsers cannot set headers on a WebSocket, so add `authorize: (c) => boolean` to check a query token or a cookie.

## Dictation cleanup

Give the routes a cleaner and every transcript is tidied before it is sent back, on the upload route and at the
end of a live one:

```ts
import { createLlmTranscriptCleaner } from "@saystack/engine-openai-compatible";

createVoiceRoutes({
  getSettings: () => settings,
  createSttAdapter: (engine) => createOpenAiSttAdapter(engine),
  createTtsAdapter: (engine) => createOpenAiTtsAdapter(engine, { voice: "marin" }),
  cleanup: {
    clean: createLlmTranscriptCleaner({ url, token, model: "gpt-6-luna" }),
    vocabulary: ["saystack"],
  },
});
```

A client sends what the conversation has been about as `context`: a multipart field on the upload, and a field of
the live route's `start` message. The dictation hooks do both when they are given a `context`. With it the cleaner
can tell a misheard `peer` from the `PR` under discussion.

Cleanup never costs the user their words. When the cleaner fails, is refused by its own check or runs out of time,
the transcript goes out as it was heard.

| Option            | Default                                                         | What it does                                                                             |
| ----------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `clean`           |                                                                 | The cleaner, an `ICleanupFn`                                                             |
| `vocabulary`      | none                                                            | Names and terms that may be spoken, spelled as they are written                          |
| `shouldClean`     | context or vocabulary to check against, or `needsCleanup(text)` | Whether a transcript is worth the round trip                                             |
| `timeoutMs`       | `4000`                                                          | How long a cleanup may take before the transcript goes out as heard                      |
| `warmUp`          | `false`                                                         | Calls the cleaner when a live dictation starts, so a model that loads on demand is ready |
| `maxContextChars` | `4000`                                                          | Only the end of a longer context is passed on                                            |
| `onResult`        | none                                                            | Told what was heard, what was sent and why, for your logs                                |

A local model that unloads when idle answers its first call late, and that first transcript would go out as it
was heard. `warmUp: true` wakes it when the speaker starts instead.

The model writes the transcript back in full, so a long dictation on a slow model can run out of time. A live
dictation tells the server how long it will wait for its final text (eight seconds unless the client changes it),
and a cleanup that would not make it is cut short, so the words arrive as they were heard instead of late. To
give a slow model the time it needs, raise `timeoutMs` and the client's `realtime.finishTimeoutMs` together.

## Related packages

[`@saystack/core`](https://www.npmjs.com/package/@saystack/core),
[`@saystack/engine-openai-compatible`](https://www.npmjs.com/package/@saystack/engine-openai-compatible),
[`@saystack/react-web`](https://www.npmjs.com/package/@saystack/react-web),
[`@saystack/react-native`](https://www.npmjs.com/package/@saystack/react-native),
[`@saystack/web`](https://www.npmjs.com/package/@saystack/web).
See the [saystack README](https://github.com/devladinci/saystack#readme) for how they fit together.

## License

MIT
