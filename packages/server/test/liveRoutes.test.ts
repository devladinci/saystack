import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createOpenAiSttAdapter, createOpenAiTtsAdapter } from "@saystack/engine-openai-compatible";
import { validateConfig } from "@saystack/core";

import { createVoiceRoutes } from "../src/createVoiceRoutes.js";
import type { IVoiceServerDeps } from "../src/types.js";

const ENGINE_URL = process.env.ENGINE_URL ?? "http://127.0.0.1:7777/v1";

const token = process.env.ENGINE_TOKEN ?? "";

const hasLiveServer = token.length > 0;

function makeLiveDeps(engineToken: string): IVoiceServerDeps {
  return {
    getSettings: () =>
      validateConfig({
        languages: [],
        stt: { url: ENGINE_URL, token: engineToken, model: process.env.STT_MODEL ?? "parakeet-tdt-0.6b-v3" },
        tts: { url: ENGINE_URL, token: engineToken, model: process.env.TTS_MODEL ?? "higgs_audio_v3-tts-4b" },
      }),
    createSttAdapter: (engineConfig) => createOpenAiSttAdapter(engineConfig),
    createTtsAdapter: (engineConfig) => createOpenAiTtsAdapter(engineConfig),
  };
}

describe.skipIf(!hasLiveServer)("createVoiceRoutes — live server through the routes", () => {
  it("capabilities are the engine's honest ones: no language list it cannot know", async () => {
    const res = await createVoiceRoutes(makeLiveDeps(token)).request("/capabilities");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { stt: { streaming: boolean; languages: string[] } };
    expect(body.stt.streaming).toBe(false);
    expect(body.stt.languages).toEqual([]);
  });

  it("a wav through raw upload comes back as text", { timeout: 60000 }, async () => {
    const audio = new Uint8Array(readFileSync("/tmp/saystack-test-1s.wav"));
    const res = await createVoiceRoutes(makeLiveDeps(token)).request("/audio/transcriptions", {
      method: "POST",
      body: audio,
      headers: { "content-type": "audio/wav" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { text: string };
    expect(body.text.length).toBeGreaterThan(0);
  });

  it("a bad token surfaces as BAD_TOKEN at 502, not a fake 200", { timeout: 30000 }, async () => {
    const audio = new Uint8Array(readFileSync("/tmp/saystack-test-1s.wav"));
    const res = await createVoiceRoutes(makeLiveDeps("sk-wrong")).request("/audio/transcriptions", {
      method: "POST",
      body: audio,
      headers: { "content-type": "audio/wav" },
    });

    expect(res.status).toBe(502);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe("BAD_TOKEN");
  });
});
describe.skipIf(!hasLiveServer)("createVoiceRoutes — live oMLX TTS through the route", () => {
  it("synthesizes real audio from text", { timeout: 120_000 }, async () => {
    const res = await createVoiceRoutes(makeLiveDeps(token)).request("/speech", {
      method: "POST",
      body: JSON.stringify({ text: "Saystack part six is alive." }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(200);
    const audio = new Uint8Array(await res.arrayBuffer());
    const riff = String.fromCharCode(...audio.slice(0, 4));
    const wave = String.fromCharCode(...audio.slice(8, 12));
    expect(riff).toBe("RIFF");
    expect(wave).toBe("WAVE");
    expect(audio.byteLength).toBeGreaterThan(4000);
  });

  it("bad token is honest: 502 BAD_TOKEN", async () => {
    const res = await createVoiceRoutes(makeLiveDeps("sk-wrong")).request("/speech", {
      method: "POST",
      body: JSON.stringify({ text: "hi" }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(502);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe("BAD_TOKEN");
  });
});
