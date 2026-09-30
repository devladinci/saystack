import type {
  INativeRecording,
  ISttTranscribeResult,
  IVoiceRecording,
} from "@saystack/core";
import { isSttErrorCode, resolveHeaders } from "@saystack/core";
import type { IDictationSendOptions } from "./types.js";

export function dictationEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/v1/audio/transcriptions`;
}

const FILE_EXTENSIONS: readonly (readonly [string, string])[] = [
  ["webm", "webm"],
  ["ogg", "ogg"],
  ["mp4", "mp4"],
  ["aac", "mp4"],
  ["mpeg", "mp3"],
  ["wav", "wav"],
];

// Engines guess the format from the file name as well as the bytes.
const fileNameFor = (mimeType: string): string => {
  const match = FILE_EXTENSIONS.find(([kind]) => mimeType.includes(kind));

  return match === undefined ? "recording" : `audio.${match[1]}`;
};

// React Native's FormData uploads a file from its uri.
const nativeFile = ({ uri, mimeType }: INativeRecording): Blob =>
  ({ uri, name: fileNameFor(mimeType), type: mimeType }) as unknown as Blob;

export async function sendDictation(
  endpoint: string,
  recording: IVoiceRecording,
  options: IDictationSendOptions,
): Promise<ISttTranscribeResult> {
  const form = new FormData();

  if ("blob" in recording) {
    form.append("file", recording.blob, fileNameFor(recording.blob.type));
  } else {
    form.append("file", nativeFile(recording));
  }

  if (options.prompt !== undefined) form.append("prompt", options.prompt);

  const init: RequestInit = { method: "POST", body: form, headers: resolveHeaders(options.headers) };
  if (options.signal !== undefined) init.signal = options.signal;

  let response: Response;
  try {
    response = await fetch(endpoint, init);
  } catch (error: unknown) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return {
      ok: false,
      errorCode: timedOut ? "TIMEOUT" : "ENGINE_UNAVAILABLE",
      message: timedOut ? "transcription timed out" : "could not reach the dictation endpoint",
    };
  }

  return readResponse(response);
}

async function readResponse(response: Response): Promise<ISttTranscribeResult> {
  const parsed = (await response.json().catch(() => undefined)) as {
    text?: string;
    language?: string;
    durationSeconds?: number;
    errorCode?: string;
    message?: string;
    error?: unknown;
  } | undefined;

  if (response.ok && parsed?.text !== undefined) {
    const okResult: ISttTranscribeResult = { ok: true, text: parsed.text };
    if (parsed.language !== undefined) {
      return { ok: true, text: parsed.text, language: parsed.language };
    }
    if (parsed.durationSeconds !== undefined) {
      return { ok: true, text: parsed.text, durationSeconds: parsed.durationSeconds };
    }
    return okResult;
  }

  if (!isSttErrorCode(parsed?.errorCode)) {
    const reason = parsed?.message ?? parsed?.error;

    return {
      ok: false,
      errorCode: "TRANSCRIPTION_FAILED",
      message: typeof reason === "string" && reason !== "" ? reason : `dictation endpoint said ${response.status}`,
    };
  }

  const code = parsed.errorCode;
  const failResult: ISttTranscribeResult = { ok: false, errorCode: code };
  if (parsed.message !== undefined) {
    return { ok: false, errorCode: code, message: parsed.message };
  }
  return failResult;
}