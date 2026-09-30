import { describe, expect, it, vi } from "vitest";

import { createHttpSynthesize } from "../src/tts/httpSpeech.js";

describe("createHttpSynthesize", () => {
  it("posts the text with fresh headers and returns the audio", async () => {
    const fetch = vi.fn(
      async (_input: string, _init: RequestInit) =>
        new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/wav" } }),
    );
    let token = "a";
    const synthesize = createHttpSynthesize({
      endpoint: "http://daemon/tts/speech",
      headers: () => ({ Authorization: `Bearer ${token}` }),
      fetch,
    });

    token = "b";
    const result = await synthesize({ text: "Hi." });
    const init = fetch.mock.calls[0]?.[1];

    expect(result.ok && result.audio.byteLength).toBe(3);
    expect(result.ok && result.mimeType).toBe("audio/wav");
    expect(init?.body).toBe(JSON.stringify({ text: "Hi." }));
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer b");
  });

  it("keeps the engine's error code and words", async () => {
    const fetch = async () =>
      new Response(JSON.stringify({ errorCode: "MODEL_NOT_FOUND", message: "No voice model" }), { status: 404 });
    const plain = async () =>
      new Response(JSON.stringify({ error: "No text-to-speech model selected" }), { status: 400 });

    await expect(createHttpSynthesize({ endpoint: "x", fetch })({ text: "Hi." })).resolves.toEqual({
      ok: false,
      errorCode: "MODEL_NOT_FOUND",
      message: "No voice model",
    });
    await expect(createHttpSynthesize({ endpoint: "x", fetch: plain })({ text: "Hi." })).resolves.toEqual({
      ok: false,
      errorCode: "TTS_FAILED",
      message: "No text-to-speech model selected",
    });
  });

  it("tells a cancelled request from an unreachable one", async () => {
    const fetch = async () => {
      throw new Error("offline");
    };
    const controller = new AbortController();
    controller.abort();

    await expect(createHttpSynthesize({ endpoint: "x", fetch })({ text: "Hi." })).resolves.toMatchObject({
      errorCode: "TTS_UNAVAILABLE",
    });
    await expect(
      createHttpSynthesize({ endpoint: "x", fetch })({ text: "Hi.", signal: controller.signal }),
    ).resolves.toMatchObject({
      errorCode: "TTS_FAILED",
      message: "cancelled by caller",
    });
  });
});
