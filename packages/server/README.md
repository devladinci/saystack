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
| `POST /voice/speech`                       | `{ text }` as JSON, returns audio                             |
| `GET /voice/audio/transcriptions/realtime` | Live dictation over a WebSocket, when `realtime` is set       |

Failures come back as JSON with an `errorCode` and a matching HTTP status. `getSettings` runs on every request,
so settings can change while the server runs. Other options: `maxBodyBytes`, `maxTextChars`, and `cors` (any
origin by default, `false` to leave CORS to your app).

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

## Related packages

[`@saystack/core`](https://www.npmjs.com/package/@saystack/core),
[`@saystack/engine-openai-compatible`](https://www.npmjs.com/package/@saystack/engine-openai-compatible),
[`@saystack/react-web`](https://www.npmjs.com/package/@saystack/react-web),
[`@saystack/react-native`](https://www.npmjs.com/package/@saystack/react-native),
[`@saystack/web`](https://www.npmjs.com/package/@saystack/web).
See the [saystack README](https://github.com/devladinci/saystack#readme) for how they fit together.

## License

MIT
