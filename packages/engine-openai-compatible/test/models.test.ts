import { afterEach, describe, expect, it, vi } from "vitest";

import { listSpeechModels } from "../src/models.js";
import { createOmlxRealtimeSttAdapter } from "../src/omlxRealtimeSttAdapter.js";

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status });

const fakeFetch = (routes: Record<string, Response | null>) => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const doFetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const response = routes[url];
    if (response === null || response === undefined) throw new TypeError("fetch failed");
    return response;
  }) as typeof fetch;
  return { doFetch, calls };
};

const OMLX_STATUS = {
  models: [
    { id: "whisper-large-v3-turbo", engine_type: "audio_stt", realtime_stt: true },
    { id: "parakeet-tdt-0.6b-v3", engine_type: "audio_stt", realtime_stt: false },
    { id: "higgs_audio_v3-tts-4b", engine_type: "audio_tts" },
    { id: "gemma-4", engine_type: "llm" },
    { id: "hidden-stt", engine_type: "audio_stt", is_hidden: true },
  ],
};

describe("listSpeechModels", () => {
  it("reads kinds and streaming support from /models/status, skipping hidden and non-speech models", async () => {
    const { doFetch, calls } = fakeFetch({ "http://h:7777/v1/models/status": json(200, OMLX_STATUS) });

    const result = await listSpeechModels({ url: "http://h:7777", token: "t" }, { fetch: doFetch });

    expect(result).toEqual({
      ok: true,
      models: [
        { id: "whisper-large-v3-turbo", kind: "stt", realtime: true },
        { id: "parakeet-tdt-0.6b-v3", kind: "stt", realtime: false },
        { id: "higgs_audio_v3-tts-4b", kind: "tts" },
      ],
    });
    expect(calls[0]?.init?.headers).toEqual({ Authorization: "Bearer t" });
  });

  it("falls back to /models and guesses kinds from names on servers without a status listing", async () => {
    const { doFetch } = fakeFetch({
      "https://api.openai.com/v1/models/status": json(404, {}),
      "https://api.openai.com/v1/models": json(200, {
        data: [
          { id: "gpt-4o-transcribe" },
          { id: "whisper-1" },
          { id: "gpt-4o-mini-tts" },
          { id: "tts-1" },
          { id: "gpt-5" },
          { id: "text-embedding-3-small" },
        ],
      }),
    });

    const result = await listSpeechModels({ url: "https://api.openai.com/v1" }, { fetch: doFetch });

    expect(result).toEqual({
      ok: true,
      models: [
        { id: "gpt-4o-transcribe", kind: "stt" },
        { id: "whisper-1", kind: "stt" },
        { id: "gpt-4o-mini-tts", kind: "tts" },
        { id: "tts-1", kind: "tts" },
      ],
    });
  });

  it("a refused key is BAD_TOKEN, an unreachable server ENGINE_UNAVAILABLE", async () => {
    const refused = fakeFetch({ "http://h/v1/models/status": json(401, {}) });
    const down = fakeFetch({});

    expect(await listSpeechModels({ url: "http://h" }, { fetch: refused.doFetch })).toMatchObject({
      ok: false,
      errorCode: "BAD_TOKEN",
    });
    expect(await listSpeechModels({ url: "http://h" }, { fetch: down.doFetch })).toMatchObject({
      ok: false,
      errorCode: "ENGINE_UNAVAILABLE",
    });
  });
});

describe("createOmlxRealtimeSttAdapter model check", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refuses a model the server says cannot stream, without opening a socket", async () => {
    vi.stubGlobal("fetch", fakeFetch({ "http://127.0.0.1:9/v1/models/status": json(200, OMLX_STATUS) }).doFetch);

    const result = await createOmlxRealtimeSttAdapter({ url: "http://127.0.0.1:9/v1" }).openRealtime({
      model: "parakeet-tdt-0.6b-v3",
    });

    expect(result).toEqual({
      ok: false,
      errorCode: "MODEL_NOT_FOUND",
      message: "parakeet-tdt-0.6b-v3 does not transcribe in realtime",
    });
  });
});
