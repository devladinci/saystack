import type { WebSocketServerLike } from "@hono/node-server";
import { serve, upgradeWebSocket } from "@hono/node-server";
import type { IConfig, ISttEngineConfig } from "@saystack/core";
import { validateConfig } from "@saystack/core";
import {
  createLlmNormalizer,
  createOmlxRealtimeSttAdapter,
  createOpenAiRealtimeSttAdapter,
  createOpenAiSttAdapter,
  createOpenAiTtsAdapter,
} from "@saystack/engine-openai-compatible";
import { createVoiceRoutes } from "@saystack/server";
import { Hono } from "hono";
import { createServer } from "vite";
import { WebSocketServer } from "ws";

const env = process.env;
const apiPort = Number(env.API_PORT ?? 5181);
const webPort = Number(env.PORT ?? 5180);
const engineUrl = env.ENGINE_URL ?? "http://127.0.0.1:7777/v1";
const chatUrl = (env.LLM_URL ?? "https://ollama.com/v1").replace(/\/+$/, "");
const chatModel = env.LLM_MODEL ?? "deepseek-v4.1-flash";

const withToken = (token: string | undefined): { token?: string } =>
  token === undefined || token === "" ? {} : { token };

const engineToken = withToken(env.ENGINE_TOKEN);
const chatToken = withToken(env.LLM_TOKEN);

const config: IConfig = {
  languages: ["en", "bg"],
  stt: { url: engineUrl, model: env.STT_MODEL ?? "whisper-large-v3-turbo", ...engineToken },
  tts: { url: engineUrl, model: env.TTS_MODEL ?? "higgs_audio_v3-tts-4b", ...engineToken },
};
const settings = validateConfig(config);

// Live dictation: "openai" speaks the OpenAI Realtime protocol (OpenAI, speaches, …); "omlx" speaks oMLX's own.
const realtimeModel = env.REALTIME_MODEL === undefined ? {} : { model: env.REALTIME_MODEL };
const createRealtimeAdapter =
  env.REALTIME_PROTOCOL === "openai"
    ? (engine: ISttEngineConfig) => createOpenAiRealtimeSttAdapter(engine, realtimeModel)
    : (engine: ISttEngineConfig) => createOmlxRealtimeSttAdapter(engine, realtimeModel);

const SYSTEM_PROMPT = [
  "You are the assistant in a voice chat demo.",
  "Answer in markdown, in the language the user writes in.",
  "Keep answers to two to five sentences unless the user asks for code, a list or a table.",
].join(" ");

const rewriteForSpeech = createLlmNormalizer({ url: chatUrl, model: chatModel, disableThinking: true, ...chatToken });

const app = new Hono();

app.route(
  "/voice",
  createVoiceRoutes({
    getSettings: () => settings,
    createSttAdapter: (engine) => createOpenAiSttAdapter(engine),
    createTtsAdapter: (engine) => createOpenAiTtsAdapter(engine),
    realtime: { upgradeWebSocket, createAdapter: createRealtimeAdapter },
  }),
);

app.post("/voice/rewrite", async (c) => {
  const body: { text?: unknown } = await c.req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text : "";
  const result = await rewriteForSpeech(text, config.languages);

  return c.json({ text: result.ok ? result.normalizedText : null });
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
