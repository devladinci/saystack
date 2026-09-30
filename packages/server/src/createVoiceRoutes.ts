import type { ISttTranscribeResult } from "@saystack/core";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { readAudioInput } from "./readAudioInput.js";
import { createRealtimeBridge } from "./realtimeBridge.js";
import { statusForErrorCode } from "./statusForErrorCode.js";
import { statusForSpeechErrorCode } from "./statusForSpeechErrorCode.js";
import type { IVoiceServerDeps } from "./types.js";

const DEFAULT_MAX_BODY_BYTES = 25 * 1024 * 1024;

export function createVoiceRoutes(deps: IVoiceServerDeps): Hono {
  const app = new Hono();
  const maxBodyBytes = deps.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  app.use("*", cors(deps.cors === undefined ? {} : { origin: deps.cors.origin }));

  app.get("/capabilities", (c) => {
    const settings = deps.getSettings();

    if (!settings.ok) {
      return c.json({ errorCode: "BAD_SETTINGS", errors: settings.errors }, 503);
    }

    if (settings.config.stt === undefined) {
      return c.json({ errorCode: "NO_ADAPTER", message: "no stt engine configured" }, 503);
    }

    return c.json({ stt: deps.createSttAdapter(settings.config.stt).capabilities });
  });

  app.post("/audio/transcriptions", async (c) => {
    const settings = deps.getSettings();

    if (!settings.ok) {
      return c.json({ errorCode: "BAD_SETTINGS", errors: settings.errors }, 503);
    }

    if (settings.config.stt === undefined) {
      return c.json({ errorCode: "NO_ADAPTER", message: "no stt engine configured" }, 503);
    }

    const read = await readAudioInput(c, maxBodyBytes);

    if (!read.ok) {
      return c.json({ errorCode: read.errorCode, message: read.message }, statusForErrorCode(read.errorCode));
    }

    const adapter = deps.createSttAdapter(settings.config.stt);
    const result = await adapter.transcribe({
      audio: read.audio,
      ...(read.mimeType !== undefined ? { mimeType: read.mimeType } : {}),
      ...(read.filename !== undefined ? { filename: read.filename } : {}),
      ...(read.prompt !== undefined ? { prompt: read.prompt } : {}),
    });

    if (!result.ok) {
      return c.json(
        { errorCode: result.errorCode, message: result.message },
        statusForErrorCode(result.errorCode),
      );
    }

    return c.json({
      text: result.text,
      ...(result.language !== undefined ? { language: result.language } : {}),
      ...(result.durationSeconds !== undefined ? { durationSeconds: result.durationSeconds } : {}),
    });
  });

  const { realtime } = deps;

  if (realtime !== undefined) {
    const finalize = async (wav: Uint8Array): Promise<ISttTranscribeResult> => {
      const settings = deps.getSettings();

      if (!settings.ok || settings.config.stt === undefined) {
        return { ok: false, errorCode: "NO_ADAPTER", message: "no stt engine configured" };
      }

      return deps.createSttAdapter(settings.config.stt).transcribe({ audio: wav, mimeType: "audio/wav", filename: "audio.wav" });
    };

    app.get(
      "/audio/transcriptions/realtime",
      realtime.upgradeWebSocket(() =>
        createRealtimeBridge(
          async (start) => {
            const settings = deps.getSettings();

            if (!settings.ok || settings.config.stt === undefined) {
              return { ok: false, errorCode: "NO_ADAPTER", message: "no stt engine configured" };
            }

            return realtime.createAdapter(settings.config.stt).openRealtime(start);
          },
          {
            ...(realtime.maxBytes === undefined ? {} : { maxBytes: realtime.maxBytes }),
            ...(realtime.finalPass === false ? {} : { finalize }),
          },
        ),
      ),
    );
  }

  app.post("/speech", async (c) => {
    const settings = deps.getSettings();

    if (!settings.ok) {
      return c.json({ errorCode: "BAD_SETTINGS", errors: settings.errors }, 503);
    }

    if (settings.config.tts === undefined) {
      return c.json({ errorCode: "NO_ADAPTER", message: "no tts engine configured" }, 503);
    }

    let body: unknown;

    try {
      body = await c.req.json();
    } catch {
      return c.json({ errorCode: "EMPTY_TEXT", message: "body must be json" }, 400);
    }

    const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    const markdown = typeof record.text === "string" ? record.text : "";
    const refAudio = typeof record.refAudio === "string" ? record.refAudio : undefined;
    const refText = typeof record.refText === "string" ? record.refText : undefined;

    if (markdown.trim().length === 0) {
      return c.json({ errorCode: "EMPTY_TEXT", message: "text is empty" }, 400);
    }

    const adapter = deps.createTtsAdapter(settings.config.tts);
    const result = await adapter.synthesize({
      text: markdown,
      ...(refAudio !== undefined && refText !== undefined ? { refAudio, refText } : {}),
    });

    if (!result.ok) {
      return c.json({ errorCode: result.errorCode, message: result.message }, statusForSpeechErrorCode(result.errorCode));
    }

    return c.body(result.audio, 200, {
      "Content-Type": result.mimeType,
    });
  });

  return app;
}