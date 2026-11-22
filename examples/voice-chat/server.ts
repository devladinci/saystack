import type { WebSocketServerLike } from "@hono/node-server";
import { serve, upgradeWebSocket } from "@hono/node-server";
import type { IConfig, ISttEngineConfig, ISttRealtimeAdapter } from "@saystack/core";
import { styleChoices, validateConfig } from "@saystack/core";
import {
  createLlmNormalizer,
  createLlmTranscriptCleaner,
  createOmlxRealtimeSttAdapter,
  createOpenAiRealtimeSttAdapter,
  createOpenAiSttAdapter,
  createOpenAiTtsAdapter,
  maxAudioTokens,
} from "@saystack/engine-openai-compatible";
import type { ICleanupReport } from "@saystack/server";
import { createRollingRealtimeSttAdapter, createVoiceRoutes } from "@saystack/server";
import { Hono } from "hono";
import { createServer } from "vite";
import { WebSocketServer } from "ws";

import { speechStyleMap } from "./src/speechStyle.ts";

interface IPreset {
  url: string;
  sttModel: string;
  ttsModel: string;
  voice?: string;
  realtime: "openai" | "omlx" | "rolling";
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
    realtime: "rolling",
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
const realtimeProtocol = env.REALTIME_PROTOCOL ?? preset.realtime;

// "rolling" needs no realtime endpoint: the live words come from the file model, heard again every half second.
const createRealtimeAdapter = (engine: ISttEngineConfig): ISttRealtimeAdapter => {
  if (realtimeProtocol === "rolling") {
    return createRollingRealtimeSttAdapter(createOpenAiSttAdapter(engine));
  }

  return realtimeProtocol === "openai"
    ? createOpenAiRealtimeSttAdapter(engine, realtimeModel)
    : createOmlxRealtimeSttAdapter(engine, realtimeModel);
};

const SYSTEM_PROMPT = [
  "You are the assistant in a voice chat demo.",
  "Answer in markdown, in the language the user writes in.",
  "Keep answers to two to five sentences unless the user asks for code, a list or a table.",
].join(" ");

// A voice that does not read inline tags would say them out loud, so another TTS_MODEL can switch them off.
const hasStyles = env.SPEECH_STYLES === undefined ? preset.styles : env.SPEECH_STYLES !== "off";

const rewriteForSpeech = createLlmNormalizer({
  url: chatUrl,
  model: chatModel,
  ...(preset.disablesThinking ? { disableThinking: true } : {}),
  ...(hasStyles ? { styleChoices: styleChoices(speechStyleMap) } : {}),
  ...chatToken,
});

const vocabulary = (env.VOCABULARY ?? "")
  .split(",")
  .map((term) => term.trim())
  .filter((term) => term !== "");

const cleanup =
  env.CLEANUP === "off"
    ? {}
    : {
        cleanup: {
          clean: createLlmTranscriptCleaner({
            url: chatUrl,
            model: chatModel,
            ...(preset.disablesThinking ? { disableThinking: true } : {}),
            ...chatToken,
          }),
          vocabulary,
          timeoutMs: Number(env.CLEANUP_TIMEOUT_MS ?? (presetName === "openai" ? 4000 : 8000)),
          // A hosted model is always loaded; a local one may have gone idle since the last dictation.
          warmUp: presetName !== "openai",
          onResult: ({ outcome, heard, text, message, ms }: ICleanupReport) => {
            console.log(
              `cleanup ${outcome} in ${ms} ms${message === undefined ? "" : ` (${message})`}: "${heard}" → "${text}"`,
            );
          },
        },
      };

const app = new Hono();

app.route(
  "/voice",
  createVoiceRoutes({
    getSettings: () => settings,
    createSttAdapter: (engine) => createOpenAiSttAdapter(engine),
    createTtsAdapter: (engine) => createOpenAiTtsAdapter(engine, ttsOptions),
    realtime: { upgradeWebSocket, createAdapter: createRealtimeAdapter },
    ...cleanup,
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

// How each server is asked to answer without thinking first. The other server's switch is not harmless:
// `reasoning_effort: "none"` made a local model on Ollama write its reasoning into the answer itself.
const quietChat = preset.disablesThinking
  ? { chat_template_kwargs: { enable_thinking: false } }
  : { reasoning_effort: "none" };

const THINKING_END = "</think>";

// A model that thinks anyway may leave that in the reply, sometimes with only the closing tag.
const withoutThinking = (content: string): string => {
  const end = content.lastIndexOf(THINKING_END);

  return (end === -1 ? content : content.slice(end + THINKING_END.length)).replace(/<think>[\s\S]*$/, "").trim();
};

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
      ...quietChat,
    }),
  }).catch(() => null);

  if (response === null || !response.ok) {
    return c.json({ error: `the chat model is not answering (${response?.status ?? "offline"})` }, 502);
  }

  const reply: { choices?: { message?: { content?: unknown } }[] } = await response.json();
  const content = reply.choices?.[0]?.message?.content;

  return c.json({ text: typeof content === "string" ? withoutThinking(content) : "" });
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
