// @vitest-environment node
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";

import { serve } from "@hono/node-server";
import { describe, expect, it } from "vitest";
import { createOpenAiSttAdapter, createOpenAiTtsAdapter } from "@saystack/engine-openai-compatible";
import { validateConfig } from "@saystack/core";

import { sendDictation } from "../src/dictationSender.js";
import { createVoiceRoutes } from "@saystack/server";
import type { IVoiceServerDeps } from "@saystack/server";

const ENGINE_URL = process.env.ENGINE_URL ?? "http://127.0.0.1:7777/v1";
const token = process.env.ENGINE_TOKEN ?? "";
const hasLiveServer = token.length > 0;

const wavPath = "/tmp/saystack-e2e.wav";
const wav = new Uint8Array(readFileSync(wavPath));

function makeLiveDeps(): IVoiceServerDeps {
  return {
    getSettings: () =>
      validateConfig({
        languages: [],
        stt: { url: ENGINE_URL, token, model: process.env.STT_MODEL ?? "parakeet-tdt-0.6b-v3" },
        tts: { url: ENGINE_URL, token, model: process.env.TTS_MODEL ?? "higgs_audio_v3-tts-4b" },
      }),
    createSttAdapter: (engineConfig) => createOpenAiSttAdapter(engineConfig),
    createTtsAdapter: (engineConfig) => createOpenAiTtsAdapter(engineConfig),
  };
}

function toNodeServer(routes: ReturnType<typeof createVoiceRoutes>): ReturnType<typeof serve> {
  return serve({ fetch: routes.fetch, port: 0 });
}
describe.skipIf(!hasLiveServer)("full stack: sender → real server routes → live server", () => {
  it("raw blob upload through the real routes returns real text", { timeout: 60000 }, async () => {
    const nodeServer = toNodeServer(createVoiceRoutes(makeLiveDeps()));
    const port = (nodeServer.address() as AddressInfo).port;

    try {
      const result = await sendDictation(
        `http://127.0.0.1:${port}/audio/transcriptions`,
        { blob: new Blob([wav], { type: "audio/wav" }) },
        {},
      );

      if (!result.ok) throw new Error(`expected ok, got ${result.errorCode}: ${result.message ?? ""}`);
      expect(typeof result.text).toBe("string");
    } finally {
      nodeServer.close();
    }
  });

  it("multipart upload through the real routes matches the hook's wire shape", { timeout: 60000 }, async () => {
    const nodeServer = toNodeServer(createVoiceRoutes(makeLiveDeps()));
    const port = (nodeServer.address() as AddressInfo).port;

    try {
      const form = new FormData();
      form.append("file", new Blob([wav], { type: "audio/wav" }), "recording");
      const response = await fetch(`http://127.0.0.1:${port}/audio/transcriptions`, {
        method: "POST",
        body: form,
      });
      const body = (await response.json()) as { text?: string; errorCode?: string };
      expect(response.status).toBe(200);
      expect(typeof body.text).toBe("string");
    } finally {
      nodeServer.close();
    }
  });
});
