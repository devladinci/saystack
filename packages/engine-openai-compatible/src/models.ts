import type { SttErrorCode } from "@saystack/core";

import { normalizeBaseUrl } from "./sttAdapter.js";

export type SpeechModelKind = "stt" | "tts";

export interface ISpeechModel {
  id: string;
  kind: SpeechModelKind;
  // Whether the model transcribes while audio arrives; undefined when the server does not say.
  realtime?: boolean;
}

export type IListSpeechModelsResult =
  { ok: true; models: ISpeechModel[] } | { ok: false; errorCode: SttErrorCode; message: string };

export interface IListSpeechModelsOptions {
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

interface IModelStatus {
  id?: unknown;
  engine_type?: unknown;
  is_hidden?: unknown;
  realtime_stt?: unknown;
}

// Plain /models says nothing about kinds, so names decide; only obvious speech names count.
const TTS_NAME = /(^|[^a-z])(tts|speech|voice|kokoro|higgs|codec)([^a-z]|$)/i;
const STT_NAME = /(^|[^a-z])(stt|asr|whisper|parakeet|transcri\w*)([^a-z]|$)/i;

const kindForName = (id: string): SpeechModelKind | null => {
  if (TTS_NAME.test(id)) return "tts";
  if (STT_NAME.test(id)) return "stt";
  return null;
};

const KIND_FOR_ENGINE: Readonly<Record<string, SpeechModelKind>> = { audio_stt: "stt", audio_tts: "tts" };

const failureFor = (status: number): { ok: false; errorCode: SttErrorCode; message: string } => ({
  ok: false,
  errorCode: status === 401 || status === 403 ? "BAD_TOKEN" : "ENGINE_UNAVAILABLE",
  message: `listing models failed: ${status}`,
});

const fromStatus = (models: readonly IModelStatus[]): ISpeechModel[] =>
  models.flatMap((model) => {
    const kind = typeof model.engine_type === "string" ? KIND_FOR_ENGINE[model.engine_type] : undefined;

    if (typeof model.id !== "string" || kind === undefined || model.is_hidden === true) {
      return [];
    }

    return [
      {
        id: model.id,
        kind,
        ...(kind === "stt" && typeof model.realtime_stt === "boolean" ? { realtime: model.realtime_stt } : {}),
      },
    ];
  });

// The speech models a server offers. Servers with a /models/status listing (oMLX) say each model's kind
// and whether it streams; other OpenAI-compatible servers only list ids, so the kind comes from the name.
export async function listSpeechModels(
  engine: { url: string; token?: string },
  { fetch: doFetch = fetch, signal }: IListSpeechModelsOptions = {},
): Promise<IListSpeechModelsResult> {
  const baseUrl = normalizeBaseUrl(engine.url);
  const init: RequestInit = {
    headers: engine.token === undefined ? {} : { Authorization: `Bearer ${engine.token}` },
    ...(signal === undefined ? {} : { signal }),
  };

  const status = await doFetch(`${baseUrl}/models/status`, init).catch(() => null);

  if (status?.ok) {
    const body = (await status.json().catch(() => null)) as { models?: unknown } | null;

    if (body !== null && Array.isArray(body.models)) {
      return { ok: true, models: fromStatus(body.models as IModelStatus[]) };
    }
  }

  if (status !== null && (status.status === 401 || status.status === 403)) {
    return failureFor(status.status);
  }

  const listing = await doFetch(`${baseUrl}/models`, init).catch(() => null);

  if (listing === null) {
    return { ok: false, errorCode: "ENGINE_UNAVAILABLE", message: "could not reach the server" };
  }

  if (!listing.ok) {
    return failureFor(listing.status);
  }

  const body = (await listing.json().catch(() => null)) as { data?: { id?: unknown }[] } | null;

  return {
    ok: true,
    models: (body?.data ?? []).flatMap(({ id }) => {
      const kind = typeof id === "string" ? kindForName(id) : null;
      return typeof id === "string" && kind !== null ? [{ id, kind }] : [];
    }),
  };
}
