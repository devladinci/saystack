import type { RequestHeaders } from "../http.js";
import { resolveHeaders } from "../http.js";
import type { ITtsSynthesizeInput, ITtsSynthesizeResult, TtsErrorCode } from "./types.js";

export type SpeechFetch = (input: string, init: RequestInit) => Promise<Response>;

export interface IHttpSpeechOptions {
  endpoint: string;
  headers?: RequestHeaders;
  fetch?: SpeechFetch;
}

const TTS_ERROR_CODES: readonly string[] = [
  "NO_ADAPTER",
  "EMPTY_TEXT",
  "TEXT_TOO_LONG",
  "MODEL_NOT_FOUND",
  "BAD_TOKEN",
  "TTS_UNAVAILABLE",
  "TTS_REJECTED_INPUT",
  "TTS_RETRYABLE",
  "TTS_FAILED",
  "TTS_TIMEOUT",
  "TTS_UNSUPPORTED_MEDIA",
];

const isTtsErrorCode = (value: unknown): value is TtsErrorCode =>
  typeof value === "string" && TTS_ERROR_CODES.includes(value);

async function failure(response: Response): Promise<ITtsSynthesizeResult> {
  const body = (await response.json().catch(() => null)) as { errorCode?: unknown; message?: unknown; error?: unknown } | null;
  const errorCode = isTtsErrorCode(body?.errorCode) ? body.errorCode : "TTS_FAILED";
  const reason = typeof body?.message === "string" ? body.message : body?.error;
  const message = typeof reason === "string" && reason !== "" ? reason : `speech endpoint said ${response.status}`;

  return { ok: false, errorCode, message };
}

// POSTs { text } as JSON and takes the audio back; saystack's server routes speak this, and so can any app.
export function createHttpSynthesize({
  endpoint,
  headers = {},
  fetch,
}: IHttpSpeechOptions): (input: ITtsSynthesizeInput) => Promise<ITtsSynthesizeResult> {
  const send: SpeechFetch = fetch ?? ((input, init) => globalThis.fetch(input, init));

  return async (input) => {
    const body = {
      text: input.text,
      ...(input.refAudio !== undefined && input.refText !== undefined ? { refAudio: input.refAudio, refText: input.refText } : {}),
    };
    let response: Response;

    try {
      response = await send(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...resolveHeaders(headers) },
        body: JSON.stringify(body),
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
    } catch {
      if (input.signal?.aborted === true) {
        return { ok: false, errorCode: "TTS_FAILED", message: "cancelled by caller" };
      }

      return { ok: false, errorCode: "TTS_UNAVAILABLE", message: "could not reach the speech endpoint" };
    }

    if (!response.ok) {
      return failure(response);
    }

    const audio = await response.arrayBuffer().catch(() => null);

    if (audio === null || audio.byteLength === 0) {
      return { ok: false, errorCode: "TTS_FAILED", message: "the speech endpoint returned no audio" };
    }

    return { ok: true, audio, mimeType: response.headers.get("content-type") ?? "audio/wav" };
  };
}
