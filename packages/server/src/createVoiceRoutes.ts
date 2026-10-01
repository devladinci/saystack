import type { ISttTranscribeResult } from "@saystack/core";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { WSEvents } from "hono/ws";

import { engineFields } from "./engineFields.js";
import { readAudioInput } from "./readAudioInput.js";
import { createRealtimeBridge } from "./realtimeBridge.js";
import { statusForErrorCode } from "./statusForErrorCode.js";
import { statusForSpeechErrorCode } from "./statusForSpeechErrorCode.js";
import type { IVoiceServerDeps } from "./types.js";

const DEFAULT_MAX_BODY_BYTES = 25 * 1024 * 1024;

const UNAUTHORIZED_CLOSE = 4001;

const refused: WSEvents = {
  onOpen: (_event, ws) => {
    ws.send(JSON.stringify({ type: "error", errorCode: "BAD_TOKEN", detail: "unauthorized" }));
    ws.close(UNAUTHORIZED_CLOSE, "unauthorized");
  },
};

// Only the operator's own field names travel on, and only with a value worth sending; anything else in the
// body is ignored rather than forwarded. The adapter sends these as body keys, so an open list would let a
// client overwrite the ones the adapter owns — the model, the text, the response format.
function readStringFields(value: unknown, allowed: ReadonlySet<string>): Readonly<Record<string, string>> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === "string" && entry[1].trim().length > 0 && allowed.has(entry[0]),
  );

  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

export function createVoiceRoutes(deps: IVoiceServerDeps): Hono {
  const app = new Hono();
  const maxBodyBytes = deps.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  if (deps.cors !== false) {
    app.use("*", cors(deps.cors === undefined ? {} : { origin: deps.cors.origin }));
  }

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
      ...(read.language !== undefined ? { language: read.language } : {}),
    });

    if (!result.ok) {
      return c.json({ errorCode: result.errorCode, message: result.message }, statusForErrorCode(result.errorCode));
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

      return deps
        .createSttAdapter(settings.config.stt)
        .transcribe({ audio: wav, mimeType: "audio/wav", filename: "audio.wav" });
    };

    app.get(
      "/audio/transcriptions/realtime",
      realtime.upgradeWebSocket(async (c) => {
        if (realtime.authorize !== undefined && !(await realtime.authorize(c))) {
          return refused;
        }

        return createRealtimeBridge(
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
        );
      }),
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
    const allowed = engineFields(deps.engineBodyFields ?? []);
    const fields = readStringFields(record.fields, allowed);

    if (markdown.trim().length === 0) {
      return c.json({ errorCode: "EMPTY_TEXT", message: "text is empty" }, 400);
    }

    if (deps.maxTextChars !== undefined) {
      // The adapter sends these as extra body keys and the engine may or may not count them; the limit
      // counts everything that travels, so a chunk an operator sized to fit is not refused.
      const extra = Object.entries(fields ?? {}).reduce((total, [key, entry]) => total + key.length + entry.length, 0);

      if (markdown.length + extra > deps.maxTextChars) {
        return c.json(
          { errorCode: "TEXT_TOO_LONG", message: `text is longer than ${deps.maxTextChars} characters` },
          statusForSpeechErrorCode("TEXT_TOO_LONG"),
        );
      }
    }

    const adapter = deps.createTtsAdapter(settings.config.tts);
    const result = await adapter.synthesize({
      text: markdown,
      signal: c.req.raw.signal,
      ...(fields === undefined ? {} : { fields }),
      ...(refAudio !== undefined && refText !== undefined ? { refAudio, refText } : {}),
    });

    if (!result.ok) {
      return c.json(
        { errorCode: result.errorCode, message: result.message },
        statusForSpeechErrorCode(result.errorCode),
      );
    }

    return c.body(result.audio, 200, {
      "Content-Type": result.mimeType,
    });
  });

  return app;
}
