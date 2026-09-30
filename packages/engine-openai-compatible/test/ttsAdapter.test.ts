import { describe, expect, it, vi } from "vitest";

import { createOmlxTtsAdapter, maxAudioTokens } from "../src/ttsAdapter.js";
import type { ITtsEngineConfig } from "@saystack/core";

const ENGINE: ITtsEngineConfig = { url: "http://127.0.0.1:7777/v1", token: "sk-live" };

interface ICapturedRequest {
  url: string;
  init: RequestInit;
}

function makeFetchResponse(status: number, body: ArrayBuffer | string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => (typeof body === "string" ? new ArrayBuffer(0) : body),
    text: async () => (typeof body === "string" ? body : ""),
  } as unknown as Response;
}

function captureFetch(responder: (init: RequestInit) => Response): {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  requests: ICapturedRequest[];
} {
  const requests: ICapturedRequest[] = [];
  return {
    requests,
    fetch: async (input, init) => {
      requests.push({ url: input, init: init ?? {} });
      return responder(init ?? {});
    },
  };
}

describe("maxAudioTokens — the token-cap formula from PR #58", () => {
  it("50 base + 5 per char", () => {
    expect(maxAudioTokens("abcd")).toBe(70);
  });

  it("never exceeds 2048 — the runaway-Higgs guard", () => {
    expect(maxAudioTokens("x".repeat(10_000))).toBe(2048);
  });
});

describe("createOmlxTtsAdapter — wire shape", () => {
  it("posts to {base}/audio/speech, wav, with the token", async () => {
    const { fetch: fakeFetch, requests } = captureFetch(() => makeFetchResponse(200, new ArrayBuffer(8)));
    const adapter = createOmlxTtsAdapter(ENGINE, { fetch: fakeFetch });

    const result = await adapter.synthesize({ text: "hello there" });

    expect(result.ok).toBe(true);
    expect(requests[0]?.url).toBe("http://127.0.0.1:7777/v1/audio/speech");
    const body = JSON.parse(String(requests[0]?.init.body)) as Record<string, unknown>;
    expect(body.model).toBe("higgs_audio_v3-tts-4b");
    expect(body.input).toBe("hello there");
    expect(body.response_format).toBe("wav");
    const headers = requests[0]?.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-live");
  });

  it("never sends temperature — the runaway-Higgs trap", async () => {
    const { fetch: fakeFetch, requests } = captureFetch(() => makeFetchResponse(200, new ArrayBuffer(8)));
    const adapter = createOmlxTtsAdapter(ENGINE, { fetch: fakeFetch });

    await adapter.synthesize({ text: "no temp" });

    const body = JSON.parse(String(requests[0]?.init.body)) as Record<string, unknown>;
    expect("temperature" in body).toBe(false);
  });

  it("sends the ref pair together, never a lone refAudio", async () => {
    const { fetch: fakeFetch, requests } = captureFetch(() => makeFetchResponse(200, new ArrayBuffer(8)));
    const adapter = createOmlxTtsAdapter(ENGINE, { fetch: fakeFetch });

    await adapter.synthesize({ text: "cloned", refAudio: "AAA=", refText: "hi mate" });
    await adapter.synthesize({ text: "not cloned", refAudio: "AAA=" });

    const first = JSON.parse(String(requests[0]?.init.body)) as Record<string, unknown>;
    const second = JSON.parse(String(requests[1]?.init.body)) as Record<string, unknown>;
    expect(first.ref_audio).toBe("AAA=");
    expect(first.ref_text).toBe("hi mate");
    expect("ref_audio" in second).toBe(false);
  });

  it("config model wins over the built-in default", async () => {
    const { fetch: fakeFetch, requests } = captureFetch(() => makeFetchResponse(200, new ArrayBuffer(8)));
    const adapter = createOmlxTtsAdapter({ ...ENGINE, model: "my-tts" }, { fetch: fakeFetch });

    await adapter.synthesize({ text: "custom" });

    const body = JSON.parse(String(requests[0]?.init.body)) as Record<string, unknown>;
    expect(body.model).toBe("my-tts");
  });

  it("caps max_tokens by the text length", async () => {
    const { fetch: fakeFetch, requests } = captureFetch(() => makeFetchResponse(200, new ArrayBuffer(8)));
    const adapter = createOmlxTtsAdapter(ENGINE, { fetch: fakeFetch });

    await adapter.synthesize({ text: "abcd" });

    const body = JSON.parse(String(requests[0]?.init.body)) as Record<string, unknown>;
    expect(body.max_tokens).toBe(70);
  });
});

describe("createOmlxTtsAdapter — coded failures", () => {
  it.each([
    [401, "BAD_TOKEN"],
    [403, "BAD_TOKEN"],
    [404, "MODEL_NOT_FOUND"],
    [429, "TTS_RETRYABLE"],
    [503, "TTS_RETRYABLE"],
    [400, "TTS_REJECTED_INPUT"],
    [500, "TTS_FAILED"],
  ])("%i maps to %s", async (status, expected) => {
    const { fetch: fakeFetch } = captureFetch(() => makeFetchResponse(status, "engine detail"));
    const adapter = createOmlxTtsAdapter(ENGINE, { fetch: fakeFetch });

    const result = await adapter.synthesize({ text: "hi" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(expected);
      expect(result.message).toContain("engine detail");
    }
  });

  it("network failure is TTS_UNAVAILABLE, not a throw", async () => {
    const adapter = createOmlxTtsAdapter(ENGINE, {
      fetch: async () => {
        throw new Error("ECONNREFUSED");
      },
    });

    const result = await adapter.synthesize({ text: "hi" });

    expect(result).toEqual({ ok: false, errorCode: "TTS_UNAVAILABLE", message: "engine unreachable" });
  });

  it("empty text fails fast without a network call", async () => {
    const { fetch: fakeFetch, requests } = captureFetch(() => makeFetchResponse(200, new ArrayBuffer(8)));
    const adapter = createOmlxTtsAdapter(ENGINE, { fetch: fakeFetch });

    const result = await adapter.synthesize({ text: "   " });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("EMPTY_TEXT");
    }
    expect(requests).toEqual([]);
  });

  it("caller abort settles fast with TTS_FAILED", async () => {
    const adapter = createOmlxTtsAdapter(ENGINE, {
      fetch: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    });
    const caller = new AbortController();

    const pending = adapter.synthesize({ text: "hi", signal: caller.signal });
    caller.abort();
    const result = await pending;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("TTS_FAILED");
      expect(result.message).toBe("cancelled by caller");
    }
  });

  it("hung engine aborts at the configured timeout with TTS_TIMEOUT", async () => {
    vi.useFakeTimers();
    try {
      const adapter = createOmlxTtsAdapter(
        { ...ENGINE, timeoutSeconds: 0.05 },
        {
          fetch: (_input, init) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
            }),
        },
      );

      const pending = adapter.synthesize({ text: "hi" });
      const assertion = expect(pending).resolves.toEqual({
        ok: false,
        errorCode: "TTS_TIMEOUT",
        message: "engine timed out",
      });

      await vi.advanceTimersByTimeAsync(60);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("zero-byte audio is a coded failure", async () => {
    const { fetch: fakeFetch } = captureFetch(() => makeFetchResponse(200, ""));
    const adapter = createOmlxTtsAdapter(ENGINE, { fetch: fakeFetch });

    const result = await adapter.synthesize({ text: "hi" });

    expect(result).toEqual({ ok: false, errorCode: "TTS_FAILED", message: "engine returned no audio" });
  });
});

describe("capabilities", () => {
  it("honest: no streaming, cloning yes (Higgs ref voice)", () => {
    const adapter = createOmlxTtsAdapter(ENGINE);
    expect(adapter.capabilities).toEqual({ streaming: false, voiceCloning: true });
  });
});
