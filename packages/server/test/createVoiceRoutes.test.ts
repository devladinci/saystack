import type { UpgradeWebSocket, WSEvents } from "hono/ws";
import { createWSMessageEvent, WSContext } from "hono/ws";
import { describe, expect, it } from "vitest";

import { createVoiceRoutes } from "../src/createVoiceRoutes.js";
import { statusForErrorCode } from "../src/statusForErrorCode.js";
import { statusForSpeechErrorCode } from "../src/statusForSpeechErrorCode.js";
import type { IVoiceServerDeps } from "../src/types.js";

const STT_CONFIG = { url: "http://127.0.0.1:7777/v1", model: "m" } as const;

function makeDeps(overrides: Partial<IVoiceServerDeps> = {}): IVoiceServerDeps {
  return {
    getSettings: () => ({
      ok: true,
      config: { languages: [], stt: STT_CONFIG, tts: { url: "http://127.0.0.1:7777/v1", model: "m" } },
    }),
    createSttAdapter: (_engineConfig) => ({
      capabilities: { streaming: false, interimResults: false, wordTimings: false, languages: ["en"] },
      transcribe: async (input) => {
        if (input.audio.byteLength === 0) {
          return { ok: false, errorCode: "EMPTY_AUDIO", message: "no audio bytes" };
        }

        return { ok: true, text: "stub transcription" };
      },
    }),
    createTtsAdapter: (_engineConfig) => ({
      capabilities: { streaming: false, voiceCloning: false },
      synthesize: async (input) => {
        if (input.text.trim().length === 0) {
          return { ok: false, errorCode: "EMPTY_TEXT", message: "no text" };
        }

        const audio = new ArrayBuffer(16);
        new Uint8Array(audio).set([82, 73, 70, 70]);

        return { ok: true, audio, mimeType: "audio/wav" };
      },
    }),
    ...overrides,
  };
}

const AUDIO_BYTES = new Uint8Array([1, 2, 3, 4]);

describe("statusForErrorCode — honest blame", () => {
  it("caller-fault codes map to 4xx", () => {
    expect(statusForErrorCode("EMPTY_AUDIO")).toBe(400);
    expect(statusForErrorCode("RECORDING_TOO_SHORT")).toBe(400);
    expect(statusForErrorCode("AUDIO_TOO_LARGE")).toBe(413);
    expect(statusForErrorCode("UNSUPPORTED_MEDIA")).toBe(415);
  });

  it("configuration faults map to 503", () => {
    expect(statusForErrorCode("NO_ADAPTER")).toBe(503);
  });

  it("engine faults map to 502", () => {
    expect(statusForErrorCode("BAD_TOKEN")).toBe(502);
    expect(statusForErrorCode("TIMEOUT")).toBe(502);
    expect(statusForErrorCode("TRANSCRIPTION_FAILED")).toBe(502);
  });
});

describe("createVoiceRoutes — settings contract", () => {
  it("bad settings keep old behavior out and say BAD_SETTINGS", async () => {
    const deps = makeDeps({
      getSettings: () => ({ ok: false, errors: [{ code: "STT_URL_INVALID", message: "no" }] }),
    });
    const res = await createVoiceRoutes(deps).request("/capabilities");

    expect(res.status).toBe(503);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe("BAD_SETTINGS");
  });

  it("config without stt answers NO_ADAPTER", async () => {
    const deps = makeDeps({ getSettings: () => ({ ok: true, config: { languages: [] } }) });
    const res = await createVoiceRoutes(deps).request("/capabilities");

    expect(res.status).toBe(503);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe("NO_ADAPTER");
  });
});

describe("createVoiceRoutes — capabilities", () => {
  it("exposes the adapter's capabilities as-is", async () => {
    const deps = makeDeps();
    const res = await createVoiceRoutes(deps).request("/capabilities");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { stt: { streaming: boolean; languages: string[] } };
    expect(body.stt.streaming).toBe(false);
    expect(body.stt.languages).toEqual(["en"]);
  });

  it("builds the adapter from the current settings, not a cached one", async () => {
    const configs: Array<{ languages: string[]; stt?: { url: string; model: string } }> = [
      { languages: [], stt: { url: "http://first", model: "m" } },
      { languages: [], stt: { url: "http://second", model: "m" } },
    ];
    let call = 0;
    const seen: string[] = [];
    const deps = makeDeps({
      getSettings: () => {
        const config = configs[call] ?? { languages: [] };
        call += 1;

        return { ok: true, config };
      },
      createSttAdapter: (engineConfig) => {
        seen.push(engineConfig.url);

        return makeDeps().createSttAdapter(engineConfig);
      },
    });
    const app = createVoiceRoutes(deps);

    await app.request("/capabilities");
    await app.request("/capabilities");

    expect(seen).toEqual(["http://first", "http://second"]);
  });
});

describe("createVoiceRoutes — transcription routing", () => {
  it("passes mimeType and filename upstream, never labelling audio .wav", async () => {
    const seen: Array<{ mimeType?: string; filename?: string }> = [];
    const deps = makeDeps({
      createSttAdapter: () => ({
        capabilities: { streaming: false, interimResults: false, wordTimings: false, languages: [] },
        transcribe: async (input) => {
          seen.push({
            ...(input.mimeType !== undefined ? { mimeType: input.mimeType } : {}),
            ...(input.filename !== undefined ? { filename: input.filename } : {}),
          });

          return { ok: true, text: "ok" };
        },
      }),
    });

    const form = new FormData();
    form.append("file", new Blob([AUDIO_BYTES], { type: "audio/webm" }), "rec.webm");
    const res = await createVoiceRoutes(deps).request("/audio/transcriptions", {
      method: "POST",
      body: form,
    });

    expect(res.status).toBe(200);
    expect(seen).toEqual([{ mimeType: "audio/webm", filename: "rec.webm" }]);
  });

  it("blank audio is the caller's fault: 400 with EMPTY_AUDIO", async () => {
    const deps = makeDeps();
    const form = new FormData();
    form.append("file", new Blob([]), "rec.wav");
    const res = await createVoiceRoutes(deps).request("/audio/transcriptions", {
      method: "POST",
      body: form,
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe("EMPTY_AUDIO");
  });

  it("oversized uploads are refused before the adapter sees them", async () => {
    const deps = makeDeps({ maxBodyBytes: 4 });
    const res = await createVoiceRoutes(deps).request("/audio/transcriptions", {
      method: "POST",
      body: AUDIO_BYTES,
      headers: { "content-type": "audio/wav", "content-length": "9" },
    });

    expect(res.status).toBe(413);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe("AUDIO_TOO_LARGE");
  });

  it("a chunked upload that declares no length is still held to maxBodyBytes", async () => {
    let calls = 0;
    const deps = makeDeps({
      maxBodyBytes: 4,
      createSttAdapter: () => ({
        capabilities: { streaming: false, interimResults: false, wordTimings: false, languages: [] },
        transcribe: async () => {
          calls += 1;

          return { ok: true, text: "ok" };
        },
      }),
    });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(3));
        controller.enqueue(new Uint8Array(6));
        controller.close();
      },
    });
    const init = { method: "POST", body, duplex: "half", headers: { "content-type": "audio/wav" } };
    const res = await createVoiceRoutes(deps).request("/audio/transcriptions", init as RequestInit);

    expect(res.status).toBe(413);
    const answer = (await res.json()) as { errorCode: string };
    expect(answer.errorCode).toBe("AUDIO_TOO_LARGE");
    expect(calls).toBe(0);
  });

  it("multipart over maxBodyBytes is refused even without a declared length", async () => {
    const deps = makeDeps({ maxBodyBytes: 64 });
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(512)]), "big.wav");
    const res = await createVoiceRoutes(deps).request("/audio/transcriptions", { method: "POST", body: form });

    expect(res.status).toBe(413);
  });

  it("multipart without a declared length still passes through; the adapter enforces its own cap", async () => {
    const seen: Array<{ byteLength: number }> = [];
    const deps = makeDeps({
      createSttAdapter: () => ({
        capabilities: { streaming: false, interimResults: false, wordTimings: false, languages: [] },
        transcribe: async (input) => {
          seen.push({ byteLength: input.audio.byteLength });

          return { ok: true, text: "ok" };
        },
      }),
    });
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(9)]), "big.wav");
    const res = await createVoiceRoutes(deps).request("/audio/transcriptions", {
      method: "POST",
      body: form,
    });

    expect(res.status).toBe(200);
    expect(seen).toEqual([{ byteLength: 9 }]);
  });

  it("raw audio bodies are accepted with content-type passthrough", async () => {
    const seen: Array<{ mimeType?: string }> = [];
    const deps = makeDeps({
      createSttAdapter: () => ({
        capabilities: { streaming: false, interimResults: false, wordTimings: false, languages: [] },
        transcribe: async (input) => {
          seen.push({ ...(input.mimeType !== undefined ? { mimeType: input.mimeType } : {}) });

          return { ok: true, text: "ok" };
        },
      }),
    });
    const res = await createVoiceRoutes(deps).request("/audio/transcriptions", {
      method: "POST",
      body: AUDIO_BYTES,
      headers: { "content-type": "audio/wav" },
    });

    expect(res.status).toBe(200);
    expect(seen).toEqual([{ mimeType: "audio/wav" }]);
  });

  it("engine failures keep their code and detail, blamed on the engine", async () => {
    const deps = makeDeps({
      createSttAdapter: () => ({
        capabilities: { streaming: false, interimResults: false, wordTimings: false, languages: [] },
        transcribe: async () => ({ ok: false, errorCode: "BAD_TOKEN", message: "engine said 401" }),
      }),
    });
    const form = new FormData();
    form.append("file", new Blob([AUDIO_BYTES]), "rec.wav");
    const res = await createVoiceRoutes(deps).request("/audio/transcriptions", {
      method: "POST",
      body: form,
    });

    expect(res.status).toBe(502);
    const body = (await res.json()) as { errorCode: string; message?: string };
    expect(body.errorCode).toBe("BAD_TOKEN");
    expect(body.message).toBe("engine said 401");
  });

  it("passes a language hint from the upload to the engine", async () => {
    const languages: (string | undefined)[] = [];
    const deps = makeDeps({
      createSttAdapter: () => ({
        capabilities: { streaming: false, interimResults: false, wordTimings: false, languages: [] },
        transcribe: async (input) => {
          languages.push(input.language);
          return { ok: true, text: "zdravei" };
        },
      }),
    });
    const form = new FormData();
    form.append("file", new Blob([AUDIO_BYTES], { type: "audio/webm" }), "a.webm");
    form.append("language", "bg");

    await createVoiceRoutes(deps).request("/audio/transcriptions", { method: "POST", body: form });
    await createVoiceRoutes(deps).request("/audio/transcriptions", {
      method: "POST",
      body: AUDIO_BYTES,
      headers: { "content-type": "audio/wav", "x-audio-language": "en" },
    });

    expect(languages).toEqual(["bg", "en"]);
  });

  it("hands back the transcription fields the engine returned", async () => {
    const deps = makeDeps({
      createSttAdapter: () => ({
        capabilities: { streaming: false, interimResults: false, wordTimings: false, languages: [] },
        transcribe: async () => ({ ok: true, text: "hey", language: "en", durationSeconds: 1.5 }),
      }),
    });
    const form = new FormData();
    form.append("file", new Blob([AUDIO_BYTES]), "rec.wav");
    const res = await createVoiceRoutes(deps).request("/audio/transcriptions", {
      method: "POST",
      body: form,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { text: string; language?: string; durationSeconds?: number };
    expect(body).toEqual({ text: "hey", language: "en", durationSeconds: 1.5 });
  });
});
describe("createVoiceRoutes — cors", () => {
  it("answers any origin by default", async () => {
    const res = await createVoiceRoutes(makeDeps()).request("/capabilities", { headers: { Origin: "http://a.test" } });

    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("cors: false leaves CORS to the host app", async () => {
    const res = await createVoiceRoutes(makeDeps({ cors: false })).request("/capabilities", {
      headers: { Origin: "http://a.test" },
    });

    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("createVoiceRoutes — speech routing", () => {
  it("text in, audio out with the engine's mime", async () => {
    const seen: Array<{ text: string; refAudio?: string }> = [];
    const deps = makeDeps({
      createTtsAdapter: (engineConfig) => {
        void engineConfig;
        return {
          capabilities: { streaming: false, voiceCloning: false },
          synthesize: async (input) => {
            seen.push({ text: input.text, ...(input.refAudio !== undefined ? { refAudio: input.refAudio } : {}) });
            const audio = new ArrayBuffer(16);
            new Uint8Array(audio).set([82, 73, 70, 70]);
            return { ok: true, audio, mimeType: "audio/wav" };
          },
        };
      },
    });
    const res = await createVoiceRoutes(deps).request("/speech", {
      method: "POST",
      body: JSON.stringify({ text: "hello there" }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/wav");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.byteLength).toBe(16);
    expect(seen).toEqual([{ text: "hello there" }]);
  });

  it("blank text is the caller's fault: 400 EMPTY_TEXT, adapter untouched", async () => {
    const seen: string[] = [];
    const deps = makeDeps({
      createTtsAdapter: () => ({
        capabilities: { streaming: false, voiceCloning: false },
        synthesize: async (input) => {
          seen.push(input.text);
          return { ok: false, errorCode: "EMPTY_TEXT", message: "no" };
        },
      }),
    });
    const res = await createVoiceRoutes(deps).request("/speech", {
      method: "POST",
      body: JSON.stringify({ text: "   " }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe("EMPTY_TEXT");
    expect(seen).toEqual([]);
  });

  it("no tts configured: 503 NO_ADAPTER", async () => {
    const res = await createVoiceRoutes({
      ...makeDeps(),
      getSettings: () => ({ ok: true, config: { languages: [], stt: STT_CONFIG } }),
    }).request("/speech", {
      method: "POST",
      body: JSON.stringify({ text: "hi" }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(503);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe("NO_ADAPTER");
  });

  it("engine blame rides through: 502 with the adapter's code", async () => {
    const deps = makeDeps({
      createTtsAdapter: () => ({
        capabilities: { streaming: false, voiceCloning: false },
        synthesize: async () => ({ ok: false, errorCode: "BAD_TOKEN", message: "engine said 401" }),
      }),
    });
    const res = await createVoiceRoutes(deps).request("/speech", {
      method: "POST",
      body: JSON.stringify({ text: "hi" }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(502);
    const body = (await res.json()) as { errorCode: string; message: string };
    expect(body).toEqual({ errorCode: "BAD_TOKEN", message: "engine said 401" });
  });

  it("retryable engine blame maps to 503", async () => {
    const deps = makeDeps({
      createTtsAdapter: () => ({
        capabilities: { streaming: false, voiceCloning: false },
        synthesize: async () => ({ ok: false, errorCode: "TTS_RETRYABLE", message: "engine said 429" }),
      }),
    });
    const res = await createVoiceRoutes(deps).request("/speech", {
      method: "POST",
      body: JSON.stringify({ text: "hi" }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(503);
  });

  it("ref pair passes through; lone refAudio does not", async () => {
    const seen: Array<{ refAudio?: string; refText?: string }> = [];
    const deps = makeDeps({
      createTtsAdapter: () => ({
        capabilities: { streaming: false, voiceCloning: false },
        synthesize: async (input) => {
          seen.push({
            ...(input.refAudio !== undefined ? { refAudio: input.refAudio } : {}),
            ...(input.refText !== undefined ? { refText: input.refText } : {}),
          });
          const audio = new ArrayBuffer(8);
          return { ok: true, audio, mimeType: "audio/wav" };
        },
      }),
    });

    await createVoiceRoutes(deps).request("/speech", {
      method: "POST",
      body: JSON.stringify({ text: "hi", refAudio: "AAA=", refText: "hi mate" }),
      headers: { "content-type": "application/json" },
    });
    await createVoiceRoutes(deps).request("/speech", {
      method: "POST",
      body: JSON.stringify({ text: "hi", refAudio: "AAA=" }),
      headers: { "content-type": "application/json" },
    });

    expect(seen).toEqual([{ refAudio: "AAA=", refText: "hi mate" }, {}]);
  });

  it("maxTextChars refuses long text with 413 TEXT_TOO_LONG before the engine is asked", async () => {
    let asked = 0;
    const res = await createVoiceRoutes(
      makeDeps({
        maxTextChars: 5,
        createTtsAdapter: () => ({
          capabilities: { streaming: false, voiceCloning: false },
          synthesize: async () => {
            asked += 1;
            return { ok: false, errorCode: "TTS_FAILED", message: "unreachable" };
          },
        }),
      }),
    ).request("/speech", { method: "POST", body: JSON.stringify({ text: "too long" }) });

    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ errorCode: "TEXT_TOO_LONG" });
    expect(asked).toBe(0);
  });

  it("hands the request's abort signal to the engine, so a closed tab stops synthesis", async () => {
    const signals: (AbortSignal | undefined)[] = [];
    await createVoiceRoutes(
      makeDeps({
        createTtsAdapter: () => ({
          capabilities: { streaming: false, voiceCloning: false },
          synthesize: async (input) => {
            signals.push(input.signal);
            return { ok: true, audio: new ArrayBuffer(4), mimeType: "audio/wav" };
          },
        }),
      }),
    ).request("/speech", { method: "POST", body: JSON.stringify({ text: "hello" }) });

    expect(signals[0]).toBeInstanceOf(AbortSignal);
  });

  it("statusForSpeechErrorCode maps the family the same way as stt", async () => {
    expect(statusForSpeechErrorCode("EMPTY_TEXT")).toBe(400);
    expect(statusForSpeechErrorCode("TEXT_TOO_LONG")).toBe(413);
    expect(statusForSpeechErrorCode("TTS_RETRYABLE")).toBe(503);
    expect(statusForSpeechErrorCode("TTS_TIMEOUT")).toBe(502);
    expect(statusForSpeechErrorCode("MODEL_NOT_FOUND")).toBe(502);
  });
});

describe("createVoiceRoutes realtime", () => {
  it("mounts the realtime route on the configured engine when asked to", async () => {
    const opened: unknown[] = [];
    const upgrade: { createEvents?: (c: unknown) => WSEvents | Promise<WSEvents> } = {};
    const upgradeWebSocket = ((factory: (c: unknown) => WSEvents | Promise<WSEvents>) => {
      upgrade.createEvents = factory;
      return async () => new Response("upgraded");
    }) as unknown as UpgradeWebSocket;
    const routes = createVoiceRoutes(
      makeDeps({
        realtime: {
          upgradeWebSocket,
          createAdapter: (engineConfig) => ({
            capabilities: { streaming: true, interimResults: true, wordTimings: false, languages: [] },
            openRealtime: async (input) => {
              opened.push({ engineConfig, input });
              return { ok: false, errorCode: "MODEL_NOT_FOUND", message: "no realtime" };
            },
          }),
        },
      }),
    );
    const sent: string[] = [];
    const ws = new WSContext({ send: (data) => sent.push(String(data)), close: () => undefined, readyState: 1 });

    expect(await (await routes.request("/audio/transcriptions/realtime")).text()).toBe("upgraded");
    const events = (await upgrade.createEvents?.({})) ?? null;
    events?.onMessage?.(createWSMessageEvent(JSON.stringify({ type: "start", language: "de" })), ws);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(opened).toEqual([{ engineConfig: STT_CONFIG, input: { language: "de" } }]);
    expect(JSON.parse(sent[0] ?? "{}")).toMatchObject({ type: "error", errorCode: "MODEL_NOT_FOUND" });
  });

  it("finishes a realtime stream with one pass of the batch engine unless told not to", async () => {
    const transcribed: string[] = [];
    const upgrade: { createEvents?: (c: unknown) => WSEvents | Promise<WSEvents> } = {};
    const upgradeWebSocket = ((factory: (c: unknown) => WSEvents | Promise<WSEvents>) => {
      upgrade.createEvents = factory;
      return async () => new Response("upgraded");
    }) as unknown as UpgradeWebSocket;
    const session = {
      capabilities: { streaming: true, interimResults: true, wordTimings: false, languages: [] },
      feedPcm16: () => undefined,
      onDelta: () => undefined,
      onError: () => undefined,
      stop: async () => ({ ok: true as const, text: " echoed echoed" }),
      release: () => undefined,
    };
    const routes = createVoiceRoutes(
      makeDeps({
        createSttAdapter: () => ({
          capabilities: { streaming: false, interimResults: false, wordTimings: false, languages: [] },
          transcribe: async (input) => {
            transcribed.push(input.mimeType ?? "");
            return { ok: true, text: "One clean pass." };
          },
        }),
        realtime: {
          upgradeWebSocket,
          createAdapter: () => ({
            capabilities: session.capabilities,
            openRealtime: async () => ({ ok: true, session }),
          }),
        },
      }),
    );
    const sent: string[] = [];
    const ws = new WSContext({ send: (data) => sent.push(String(data)), close: () => undefined, readyState: 1 });

    await routes.request("/audio/transcriptions/realtime");
    const events = (await upgrade.createEvents?.({})) ?? null;
    events?.onMessage?.(createWSMessageEvent(JSON.stringify({ type: "start" })), ws);
    await new Promise((resolve) => setTimeout(resolve, 0));
    events?.onMessage?.(createWSMessageEvent(JSON.stringify({ type: "stop" })), ws);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(transcribed).toEqual(["audio/wav"]);
    expect(JSON.parse(sent.at(-1) ?? "{}")).toEqual({ type: "transcript.done", text: "One clean pass." });
  });

  it("refuses a socket the app does not authorize: BAD_TOKEN, close 4001, no engine opened", async () => {
    const upgrade: { createEvents?: (c: unknown) => WSEvents | Promise<WSEvents> } = {};
    const upgradeWebSocket = ((factory: (c: unknown) => WSEvents | Promise<WSEvents>) => {
      upgrade.createEvents = factory;
      return async () => new Response("upgraded");
    }) as unknown as UpgradeWebSocket;
    let opened = 0;
    const seen: unknown[] = [];
    const routes = createVoiceRoutes(
      makeDeps({
        realtime: {
          upgradeWebSocket,
          authorize: (c) => {
            seen.push(c);
            return false;
          },
          createAdapter: () => ({
            capabilities: { streaming: true, interimResults: true, wordTimings: false, languages: [] },
            openRealtime: async () => {
              opened += 1;
              return { ok: false, errorCode: "MODEL_NOT_FOUND" };
            },
          }),
        },
      }),
    );
    const sent: string[] = [];
    const closed: unknown[] = [];
    const ws = new WSContext({
      send: (data) => sent.push(String(data)),
      close: (code) => closed.push(code),
      readyState: 1,
    });

    await routes.request("/audio/transcriptions/realtime");
    const context = { req: "upgrade" };
    const events = (await upgrade.createEvents?.(context)) ?? null;
    events?.onOpen?.(new Event("open"), ws);
    events?.onMessage?.(createWSMessageEvent(JSON.stringify({ type: "start" })), ws);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(seen).toEqual([context]);
    expect(JSON.parse(sent[0] ?? "{}")).toMatchObject({ type: "error", errorCode: "BAD_TOKEN" });
    expect(closed).toEqual([4001]);
    expect(opened).toBe(0);
  });

  it("has no realtime route unless one is configured", async () => {
    expect((await createVoiceRoutes(makeDeps()).request("/audio/transcriptions/realtime")).status).toBe(404);
  });
});
