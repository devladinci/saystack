import { describe, expect, it } from "vitest";

import { createOpenAiSttAdapter, createOpenAiTtsAdapter } from "@saystack/engine-openai-compatible";
import { validateConfig } from "@saystack/core";

import { createVoiceRoutes } from "../src/createVoiceRoutes.js";
import type { IVoiceServerDeps } from "../src/types.js";

const { ENGINE_URL = "", ENGINE_TOKEN = "", STT_MODEL = "", TTS_MODEL = "", TTS_VOICE } = process.env;

const hasLiveServer = [ENGINE_URL, ENGINE_TOKEN, STT_MODEL, TTS_MODEL].every((value) => value.length > 0);

const ttsOptions = TTS_VOICE === undefined ? {} : { voice: TTS_VOICE };

function makeLiveDeps(engineToken: string): IVoiceServerDeps {
  return {
    getSettings: () =>
      validateConfig({
        languages: [],
        stt: { url: ENGINE_URL, token: engineToken, model: STT_MODEL },
        tts: { url: ENGINE_URL, token: engineToken, model: TTS_MODEL },
      }),
    createSttAdapter: (engineConfig) => createOpenAiSttAdapter(engineConfig),
    createTtsAdapter: (engineConfig) => createOpenAiTtsAdapter(engineConfig, ttsOptions),
  };
}

async function speak(text: string): Promise<Uint8Array> {
  const res = await createVoiceRoutes(makeLiveDeps(ENGINE_TOKEN)).request("/speech", {
    method: "POST",
    body: JSON.stringify({ text }),
    headers: { "content-type": "application/json" },
  });

  return new Uint8Array(await res.arrayBuffer());
}

describe.skipIf(!hasLiveServer)("createVoiceRoutes — live server through the routes", () => {
  it("capabilities are the engine's honest ones: no language list it cannot know", async () => {
    const res = await createVoiceRoutes(makeLiveDeps(ENGINE_TOKEN)).request("/capabilities");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { stt: { streaming: boolean; languages: string[] } };
    expect(body.stt.streaming).toBe(false);
    expect(body.stt.languages).toEqual([]);
  });

  it("speech the engine made comes back as text", { timeout: 120_000 }, async () => {
    const audio = await speak("Hello from the live test.");
    const res = await createVoiceRoutes(makeLiveDeps(ENGINE_TOKEN)).request("/audio/transcriptions", {
      method: "POST",
      body: audio,
      headers: { "content-type": "audio/wav" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { text: string };
    expect(body.text.length).toBeGreaterThan(0);
  });

  it("a bad token surfaces as BAD_TOKEN at 502, not a fake 200", { timeout: 120_000 }, async () => {
    const audio = await speak("A bad token.");
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
describe.skipIf(!hasLiveServer)("createVoiceRoutes — live TTS through the route", () => {
  it("synthesizes real audio from text", { timeout: 120_000 }, async () => {
    const audio = await speak("Saystack is alive.");
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
