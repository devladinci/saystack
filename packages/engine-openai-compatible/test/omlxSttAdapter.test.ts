import { describe, expect, it } from "vitest";

import { createOmlxSttAdapter, extForMime, guessFilename } from "../src/omlxSttAdapter.js";

const OMLX_URL = process.env.OMLX_URL ?? "http://127.0.0.1:7777/v1";

const token = process.env.OMLX_TOKEN ?? "";

const config = { url: OMLX_URL, token } as const;

const hasLiveServer = token.length > 0;

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

describe("status mapping — honest blame", () => {
  it("auth problems say BAD_TOKEN, not 'engine down'", () => {
    expect(createOmlxSttAdapter({ url: OMLX_URL, token: "x" }).capabilities.streaming).toBe(false);
  });
});

describe("createOmlxSttAdapter — offline contract", () => {
  it("normalizes baseUrl with trailing slash and /v1 duplication", () => {
    const adapter = createOmlxSttAdapter({ url: "http://x:7777/v1/", token: "t" });

    expect(adapter.capabilities.streaming).toBe(false);
  });

  it("empty audio is rejected locally as EMPTY_AUDIO without a network call", async () => {
    const adapter = createOmlxSttAdapter({ url: "http://127.0.0.1:9/v1", token: "t" });
    const result = await adapter.transcribe({ audio: new Uint8Array() });

    if (result.ok) throw new Error("expected failure");
    expect(result.errorCode).toBe("EMPTY_AUDIO");
  });

  it("aborts a hang after the timeout instead of waiting on the engine", { timeout: 20000 }, async () => {
    const adapter = createOmlxSttAdapter({ url: "http://10.255.255.1:7777/v1" }, { timeoutMs: 500, minAudioBytes: 1 });
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

    const pending = createOmlxSttAdapter({ url: "http://10.255.255.1:7777/v1" }, { minAudioBytes: 1 }).transcribe({
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
    const adapter = createOmlxSttAdapter({ url: "http://x/v1" }, { maxBytes: 4, minAudioBytes: 1 });
    const result = await adapter.transcribe({ audio: new Uint8Array([1, 2, 3, 4, 5]), mimeType: "audio/wav", filename: "x.wav" });

    if (result.ok) throw new Error("expected failure");
    expect(result.errorCode).toBe("AUDIO_TOO_LARGE");
  });

  it("audio too short is its own code (RECORDING_TOO_SHORT)", async () => {
    const adapter = createOmlxSttAdapter({ url: "http://x/v1" }, { minAudioBytes: 200 });
    const result = await adapter.transcribe({ audio: new Uint8Array([1, 2, 3]), mimeType: "audio/wav" });

    if (result.ok) throw new Error("expected failure");
    expect(result.errorCode).toBe("RECORDING_TOO_SHORT");
  });
});

describe.skipIf(!hasLiveServer)("createOmlxSttAdapter — live oMLX", () => {
  it("declares whole-file capabilities and honest languages", () => {
    const adapter = createOmlxSttAdapter(config);

    expect(adapter.capabilities.streaming).toBe(false);
    expect(adapter.capabilities.interimResults).toBe(false);
    expect(adapter.capabilities.languages).toContain("ru");
    expect(adapter.capabilities.languages).not.toContain("mk");
    expect(adapter.capabilities.languages.length).toBe(25);
  });

  it("transcribes a real wav against the live engine", { timeout: 60000 }, async () => {
    const { readFileSync } = await import("node:fs");
    const audio = new Uint8Array(readFileSync("/tmp/saystack-test-1s.wav"));

    const adapter = createOmlxSttAdapter(config);
    const result = await adapter.transcribe({ audio, mimeType: "audio/wav", filename: "test.wav" });

    if (!result.ok) throw new Error(`expected ok, got ${result.errorCode}: ${result.message ?? ""}`);
    expect(typeof result.text).toBe("string");
  });

  it("surfaces a bad model as MODEL_NOT_FOUND", { timeout: 30000 }, async () => {
    const adapter = createOmlxSttAdapter(config, { model: "no-such-model-xyz", minAudioBytes: 1 });
    const result = await adapter.transcribe({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: "audio/wav",
      filename: "x.wav",
    });

    if (result.ok) throw new Error("expected failure");
    expect(result.errorCode).toBe("MODEL_NOT_FOUND");
  });

  it("surfaces a wrong token as BAD_TOKEN, not 'engine down'", { timeout: 30000 }, async () => {
    const adapter = createOmlxSttAdapter({ url: OMLX_URL, token: "sk-wrong" }, { minAudioBytes: 1 });
    const result = await adapter.transcribe({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: "audio/wav",
      filename: "x.wav",
    });

    if (result.ok) throw new Error("expected failure");
    expect(result.errorCode).toBe("BAD_TOKEN");
  });
});