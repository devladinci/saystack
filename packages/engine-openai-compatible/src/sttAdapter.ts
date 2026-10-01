import type {
  ISttAdapter,
  ISttCapabilities,
  ISttEngineConfig,
  ISttTranscribeInput,
  ISttTranscribeResult,
  SttErrorCode,
} from "@saystack/core";

const KNOWN_AUDIO_EXTS = [".mp3", ".wav", ".m4a", ".mp4", ".webm", ".ogg", ".opus", ".flac", ".aac", ".aiff"] as const;

export interface IOpenAiSttOptions {
  model?: string;
  // What the model can hear, when the app knows it; the adapter cannot tell from an OpenAI-compatible server.
  languages?: readonly string[];
  maxBytes?: number;
  timeoutMs?: number;
  minAudioBytes?: number;
}

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

const DEFAULT_TIMEOUT_MS = 60_000;

const MIN_AUDIO_BYTES = 1_024;

export function normalizeBaseUrl(rawUrl: string): string {
  let url = rawUrl.trim();

  while (url.endsWith("/")) {
    url = url.slice(0, -1);
  }

  if (!url.endsWith("/v1")) {
    url = `${url}/v1`;
  }

  return url;
}

export function extForMime(mimeType?: string): string {
  const mime = (mimeType ?? "audio/wav").split(";")[0]?.trim().toLowerCase() ?? "audio/wav";

  if (mime === "audio/mpeg" || mime === "audio/mp3") {
    return ".mp3";
  }

  for (const ext of KNOWN_AUDIO_EXTS) {
    if (mime.includes(ext.slice(1))) {
      return ext;
    }
  }

  return ".wav";
}

export function guessFilename(mimeType?: string, filename?: string): string {
  if (filename !== undefined && filename.length > 0 && filename.includes(".")) {
    return filename;
  }

  const base = filename !== undefined && filename.length > 0 ? filename : "audio";

  return `${base}${extForMime(mimeType)}`;
}

function statusToErrorCode(status: number): SttErrorCode {
  if (status === 401 || status === 403) {
    return "BAD_TOKEN";
  }

  if (status === 429 || status === 503) {
    return "RETRYABLE";
  }

  if (status === 404) {
    return "MODEL_NOT_FOUND";
  }

  if (status === 413) {
    return "AUDIO_TOO_LARGE";
  }

  if (status === 400 || status === 415) {
    return "ENGINE_REJECTED_INPUT";
  }

  return "TRANSCRIPTION_FAILED";
}

export function createOpenAiSttAdapter(engineConfig: ISttEngineConfig, options: IOpenAiSttOptions = {}): ISttAdapter {
  const baseUrl = normalizeBaseUrl(engineConfig.url);
  const token = engineConfig.token;
  const model = options.model ?? engineConfig.model;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const defaultTimeoutMs =
    engineConfig.timeoutSeconds !== undefined ? engineConfig.timeoutSeconds * 1000 : DEFAULT_TIMEOUT_MS;
  const configuredTimeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const minAudioBytes = options.minAudioBytes ?? MIN_AUDIO_BYTES;

  const headers = (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

  const capabilities: ISttCapabilities = {
    streaming: false,
    interimResults: false,
    wordTimings: false,
    languages: options.languages ?? [],
  };

  return {
    capabilities,

    async transcribe(input: ISttTranscribeInput): Promise<ISttTranscribeResult> {
      const sizeLimit = input.maxBytes ?? maxBytes;

      if (input.audio.byteLength === 0) {
        return { ok: false, errorCode: "EMPTY_AUDIO", message: "no audio bytes" };
      }

      if (input.audio.byteLength < minAudioBytes) {
        return {
          ok: false,
          errorCode: "RECORDING_TOO_SHORT",
          message: `audio is ${input.audio.byteLength} bytes, need at least ${minAudioBytes}`,
        };
      }

      if (input.audio.byteLength > sizeLimit) {
        return {
          ok: false,
          errorCode: "AUDIO_TOO_LARGE",
          message: `audio is ${input.audio.byteLength} bytes, limit ${sizeLimit}`,
        };
      }

      const timeoutSignal = AbortSignal.timeout(configuredTimeoutMs);
      const fetchSignal = input.signal !== undefined ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;

      const form = new FormData();

      form.append(
        "file",
        new Blob([new Uint8Array(input.audio)], { type: input.mimeType ?? "application/octet-stream" }),
        guessFilename(input.mimeType, input.filename),
      );

      form.append("model", model);

      if (input.prompt !== undefined) {
        form.append("prompt", input.prompt);
      }

      if (input.language !== undefined) {
        form.append("language", input.language);
      }

      let res: Response;

      try {
        res = await fetch(`${baseUrl}/audio/transcriptions`, {
          method: "POST",
          headers: headers(),
          body: form,
          signal: fetchSignal,
        });
      } catch (error) {
        const name = error instanceof Error ? error.name : "";

        if (name === "TimeoutError" || name === "AbortError") {
          return {
            ok: false,
            errorCode: "TIMEOUT",
            message:
              input.signal?.aborted === true ? "cancelled by caller" : `timed out after ${configuredTimeoutMs} ms`,
          };
        }

        return {
          ok: false,
          errorCode: "ENGINE_UNAVAILABLE",
          message: "engine unreachable",
        };
      }

      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 300);

        return {
          ok: false,
          errorCode: statusToErrorCode(res.status),
          message: detail.length > 0 ? detail : `transcription failed: ${res.status}`,
        };
      }

      const body = (await res.json().catch(() => null)) as {
        text?: string;
        language?: string | null;
        duration?: number | null;
      } | null;

      if (body === null || typeof body.text !== "string") {
        return {
          ok: false,
          errorCode: "TRANSCRIPTION_FAILED",
          message: "unexpected response shape",
        };
      }

      const language = typeof body.language === "string" ? body.language : undefined;
      const durationSeconds = typeof body.duration === "number" ? body.duration : undefined;

      return {
        ok: true,
        text: body.text,
        ...(language !== undefined ? { language } : {}),
        ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      };
    },
  } satisfies ISttAdapter;
}
