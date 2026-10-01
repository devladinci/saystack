import type { WebSocketServerLike } from "@hono/node-server";
import { serve, upgradeWebSocket } from "@hono/node-server";
import type { IConfig, ISttEngineConfig } from "@saystack/core";
import { styleChoices, validateConfig } from "@saystack/core";
import {
  createLlmNormalizer,
  createOmlxRealtimeSttAdapter,
  createOpenAiRealtimeSttAdapter,
  createOpenAiSttAdapter,
  createOpenAiTtsAdapter,
  maxAudioTokens,
} from "@saystack/engine-openai-compatible";
import { createVoiceRoutes } from "@saystack/server";
import { Hono } from "hono";
import { createServer } from "vite";
import { WebSocketServer } from "ws";

import { speechStyleMap } from "./src/speechStyle.ts";

interface IPreset {
  url: string;
  sttModel: string;
  ttsModel: string;
  voice?: string;
  realtime: "openai" | "omlx";
  realtimeModel?: string;
  chatModel?: string;
  capsAudioTokens: boolean;
  disablesThinking: boolean;
  // Whether this engine reads delivery styles as inline tags, and so may be offered them.
  styles: boolean;
}

const PRESETS: Readonly<Record<string, IPreset>> = {
  openai: {
    url: "https://api.openai.com/v1",
    sttModel: "gpt-transcribe",
    ttsModel: "gpt-4o-mini-tts",
    voice: "marin",
    realtime: "openai",
    realtimeModel: "gpt-live-transcribe",
    chatModel: "gpt-6-luna",
    capsAudioTokens: false,
    disablesThinking: false,
    styles: false,
  },
  omlx: {
    url: "http://127.0.0.1:7777/v1",
    sttModel: "whisper-large-v3-turbo",
    ttsModel: "higgs_audio_v3-tts-4b",
    realtime: "omlx",
    capsAudioTokens: true,
    disablesThinking: true,
    styles: true,
  },
};

const env = process.env;
const presetName = env.ENGINE ?? "openai";
const preset = PRESETS[presetName];

if (preset === undefined) {
  throw new Error(`ENGINE must be one of ${Object.keys(PRESETS).join(", ")}, got '${presetName}'`);
}

const withToken = (token: string | undefined): { token?: string } =>
  token === undefined || token === "" ? {} : { token };

const apiPort = Number(env.API_PORT ?? 5181);
const webPort = Number(env.PORT ?? 5180);
const engineUrl = env.ENGINE_URL ?? preset.url;
const engineToken = withToken(env.ENGINE_TOKEN);
const chatUrl = (env.LLM_URL ?? engineUrl).replace(/\/+$/, "");
const chatToken = withToken(env.LLM_TOKEN ?? env.ENGINE_TOKEN);
const chatModel = env.LLM_MODEL ?? preset.chatModel;

if (chatModel === undefined) {
  throw new Error(`set LLM_MODEL: the ${presetName} preset has no default chat model`);
}

const voice = env.TTS_VOICE ?? preset.voice;
const ttsOptions = {
  ...(voice === undefined ? {} : { voice }),
  ...(preset.capsAudioTokens ? { maxTokens: maxAudioTokens } : {}),
};

const config: IConfig = {
  languages: (env.LANGUAGES ?? "en").split(",").map((language) => language.trim()),
  stt: { url: engineUrl, model: env.STT_MODEL ?? preset.sttModel, ...engineToken },
  tts: { url: engineUrl, model: env.TTS_MODEL ?? preset.ttsModel, ...engineToken },
};
const settings = validateConfig(config);

const realtimeModelName = env.REALTIME_MODEL ?? preset.realtimeModel;
const realtimeModel = realtimeModelName === undefined ? {} : { model: realtimeModelName };
const createRealtimeAdapter =
  (env.REALTIME_PROTOCOL ?? preset.realtime) === "openai"
    ? (engine: ISttEngineConfig) => createOpenAiRealtimeSttAdapter(engine, realtimeModel)
    : (engine: ISttEngineConfig) => createOmlxRealtimeSttAdapter(engine, realtimeModel);

const SYSTEM_PROMPT = [
  "You are the assistant in a voice chat demo.",
  "Answer in markdown, in the language the user writes in.",
  "Keep answers to two to five sentences unless the user asks for code, a list or a table.",
].join(" ");

const rewriteForSpeech = createLlmNormalizer({
  url: chatUrl,
  model: chatModel,
  ...(preset.disablesThinking ? { disableThinking: true } : {}),
  ...(preset.styles ? { styleChoices: styleChoices(speechStyleMap) } : {}),
  ...chatToken,
});

const app = new Hono();

app.route(
  "/voice",
  createVoiceRoutes({
    getSettings: () => settings,
    createSttAdapter: (engine) => createOpenAiSttAdapter(engine),
    createTtsAdapter: (engine) => createOpenAiTtsAdapter(engine, ttsOptions),
    realtime: { upgradeWebSocket, createAdapter: createRealtimeAdapter },
  }),
);

app.post("/voice/rewrite", async (c) => {
  const body: { text?: unknown } = await c.req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text : "";
  const result = await rewriteForSpeech(text, config.languages);

  return c.json({
    text: result.ok ? result.normalizedText : null,
    ...(result.ok && result.style !== undefined ? { style: result.style } : {}),
  });
});

app.post("/api/chat", async (c) => {
  const body: { messages?: unknown } = await c.req.json().catch(() => ({}));
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const response = await fetch(`${chatUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(chatToken.token === undefined ? {} : { Authorization: `Bearer ${chatToken.token}` }),
    },
    body: JSON.stringify({
      model: chatModel,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      reasoning_effort: "none",
    }),
  }).catch(() => null);

  if (response === null || !response.ok) {
    return c.json({ error: `the chat model is not answering (${response?.status ?? "offline"})` }, 502);
  }

  const reply: { choices?: { message?: { content?: unknown } }[] } = await response.json();
  const content = reply.choices?.[0]?.message?.content;

  return c.json({ text: typeof content === "string" ? content : "" });
});

// ws types its options with `| undefined`, which exactOptionalPropertyTypes will not match to node-server's.
const sockets = new WebSocketServer({ noServer: true }) as unknown as WebSocketServerLike;

serve({ fetch: app.fetch, port: apiPort, hostname: "127.0.0.1", websocket: { server: sockets } });

const vite = await createServer({
  configFile: new URL("./vite.config.ts", import.meta.url).pathname,
  server: { port: webPort, strictPort: true },
});

await vite.listen();
vite.printUrls();
