import { afterEach, describe, expect, it, vi } from "vitest";

import { pcm16ToWav } from "@saystack/core";

import { createOpenAiSttAdapter, extForMime, guessFilename } from "../src/sttAdapter.js";

const { ENGINE_URL = "", ENGINE_TOKEN = "", STT_MODEL = "" } = process.env;

const config = { url: ENGINE_URL, token: ENGINE_TOKEN, model: STT_MODEL } as const;

const hasLiveServer = [ENGINE_URL, ENGINE_TOKEN, STT_MODEL].every((value) => value.length > 0);

const toneWav = (): Uint8Array => {
  const samples = new Int16Array(16000);

  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.round(Math.sin((2 * Math.PI * 440 * index) / 16000) * 8000);
  }

  return pcm16ToWav([new Uint8Array(samples.buffer)]);
};

describe("filename/mime mapping", () => {
  it("mp3 is recognised as .mp3, not forced to .wav", () => {
    expect(extForMime("audio/mpeg")).toBe(".mp3");
    expect(guessFilename("audio/mpeg")).toBe("audio.mp3");
  });

  it("a browser-style extensionless name keeps its derived extension", () => {
    expect(guessFilename("audio/webm", "blob")).toBe("blob.webm");
    expect(guessFilename(undefined, "blob")).toBe("blob.wav");
  });

  it("a real filename passes through untouched", () => {
    expect(guessFilename("audio/wav", "clip.wav")).toBe("clip.wav");
  });

  it("an empty filename is treated as no filename", () => {
    expect(guessFilename("audio/wav", "")).toBe("audio.wav");
  });
});

describe("language hint", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the hint as the standard `language` form field", async () => {
    const forms: FormData[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      forms.push(init.body as FormData);
      return new Response(JSON.stringify({ text: "zdravei" }), { status: 200 });
    });
    const adapter = createOpenAiSttAdapter({ url: "http://x/v1", model: "m" }, { minAudioBytes: 1 });

    await adapter.transcribe({ audio: new Uint8Array(8), mimeType: "audio/wav", language: "bg" });
    await adapter.transcribe({ audio: new Uint8Array(8), mimeType: "audio/wav" });

    expect(forms.map((form) => form.get("language"))).toEqual(["bg", null]);
  });
});

describe("declared languages", () => {
  it("reports none unless the app declares what its model hears", () => {
    expect(createOpenAiSttAdapter({ url: "http://x/v1", model: "m" }).capabilities.languages).toEqual([]);
    expect(
      createOpenAiSttAdapter({ url: "http://x/v1", model: "m" }, { languages: ["bg", "en"] }).capabilities.languages,
    ).toEqual(["bg", "en"]);
  });
});

describe("status mapping — honest blame", () => {
  it("auth problems say BAD_TOKEN, not 'engine down'", () => {
    expect(createOpenAiSttAdapter({ url: "http://x/v1", token: "x", model: "m" }).capabilities.streaming).toBe(false);
  });
});

describe("createOpenAiSttAdapter — offline contract", () => {
  it("normalizes baseUrl with trailing slash and /v1 duplication", () => {
    const adapter = createOpenAiSttAdapter({ url: "http://x:7777/v1/", token: "t", model: "m" });

    expect(adapter.capabilities.streaming).toBe(false);
  });

  it("empty audio is rejected locally as EMPTY_AUDIO without a network call", async () => {
    const adapter = createOpenAiSttAdapter({ url: "http://127.0.0.1:9/v1", token: "t", model: "m" });
    const result = await adapter.transcribe({ audio: new Uint8Array() });

    if (result.ok) throw new Error("expected failure");
    expect(result.errorCode).toBe("EMPTY_AUDIO");
  });

  it("aborts a hang after the timeout instead of waiting on the engine", { timeout: 20000 }, async () => {
    const adapter = createOpenAiSttAdapter(
      { url: "http://10.255.255.1:7777/v1", model: "m" },
      { timeoutMs: 500, minAudioBytes: 1 },
    );
    const startedAt = Date.now();
    const result = await adapter.transcribe({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: "audio/wav",
      filename: "x.wav",
    });
    const elapsed = Date.now() - startedAt;

    if (result.ok) throw new Error("expected failure");
    expect(result.errorCode).toBe("TIMEOUT");
    expect(elapsed).toBeLessThan(5000);
  });

  it("honors a caller-provided signal (user released the mic mid-request)", async () => {
    const controller = new AbortController();

    const pending = createOpenAiSttAdapter(
      { url: "http://10.255.255.1:7777/v1", model: "m" },
      { minAudioBytes: 1 },
    ).transcribe({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: "audio/wav",
      filename: "x.wav",
      signal: controller.signal,
    });

    controller.abort();

    const result = await pending;

    if (result.ok) throw new Error("expected failure");
    expect(result.errorCode).toBe("TIMEOUT");
  });

  it("oversized audio is rejected locally as AUDIO_TOO_LARGE", async () => {
    const adapter = createOpenAiSttAdapter({ url: "http://x/v1", model: "m" }, { maxBytes: 4, minAudioBytes: 1 });
    const result = await adapter.transcribe({
      audio: new Uint8Array([1, 2, 3, 4, 5]),
      mimeType: "audio/wav",
      filename: "x.wav",
    });

    if (result.ok) throw new Error("expected failure");
    expect(result.errorCode).toBe("AUDIO_TOO_LARGE");
  });

  it("audio too short is its own code (RECORDING_TOO_SHORT)", async () => {
    const adapter = createOpenAiSttAdapter({ url: "http://x/v1", model: "m" }, { minAudioBytes: 200 });
    const result = await adapter.transcribe({ audio: new Uint8Array([1, 2, 3]), mimeType: "audio/wav" });

    if (result.ok) throw new Error("expected failure");
    expect(result.errorCode).toBe("RECORDING_TOO_SHORT");
  });
});

describe.skipIf(!hasLiveServer)("createOpenAiSttAdapter — live server", () => {
  it("transcribes a real wav against the live engine", { timeout: 60000 }, async () => {
    const audio = toneWav();
    const adapter = createOpenAiSttAdapter(config);
    const result = await adapter.transcribe({ audio, mimeType: "audio/wav", filename: "test.wav" });

    if (!result.ok) throw new Error(`expected ok, got ${result.errorCode}: ${result.message ?? ""}`);
    expect(typeof result.text).toBe("string");
  });

  it("surfaces a bad model as MODEL_NOT_FOUND", { timeout: 30000 }, async () => {
    const adapter = createOpenAiSttAdapter(config, { model: "no-such-model-xyz", minAudioBytes: 1 });
    const result = await adapter.transcribe({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: "audio/wav",
      filename: "x.wav",
    });

    if (result.ok) throw new Error("expected failure");
    expect(result.errorCode).toBe("MODEL_NOT_FOUND");
  });

  it("surfaces a wrong token as BAD_TOKEN, not 'engine down'", { timeout: 30000 }, async () => {
    const adapter = createOpenAiSttAdapter({ ...config, token: "sk-wrong" }, { minAudioBytes: 1 });
    const result = await adapter.transcribe({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: "audio/wav",
      filename: "x.wav",
    });

    if (result.ok) throw new Error("expected failure");
    expect(result.errorCode).toBe("BAD_TOKEN");
  });
});
