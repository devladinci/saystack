export type SttErrorCode =
  | "NO_ADAPTER"
  | "NO_PLATFORM"
  | "EMPTY_AUDIO"
  | "RECORDING_TOO_SHORT"
  | "AUDIO_TOO_LARGE"
  | "UNSUPPORTED_MEDIA"
  | "MIC_PERMISSION_DENIED"
  | "MIC_UNAVAILABLE"
  | "RECORDING_UNSUPPORTED"
  | "BAD_TOKEN"
  | "MODEL_NOT_FOUND"
  | "LANGUAGE_UNSUPPORTED"
  | "ENGINE_UNAVAILABLE"
  | "RETRYABLE"
  | "TIMEOUT"
  | "ENGINE_REJECTED_INPUT"
  | "TRANSCRIPTION_FAILED";

export interface ISttCapabilities {
  streaming: boolean;
  interimResults: boolean;
  wordTimings: boolean;
  languages: readonly string[];
}

export interface ISttTranscribeInput {
  audio: Uint8Array;
  mimeType?: string;
  filename?: string;
  prompt?: string;
  maxBytes?: number;
  signal?: AbortSignal;
  minDurationMs?: number;
}

export type ISttTranscribeResult =
  | { ok: true; text: string; language?: string; durationSeconds?: number }
  | { ok: false; errorCode: SttErrorCode; message?: string };

export interface ISttAdapter {
  capabilities: ISttCapabilities;
  transcribe(input: ISttTranscribeInput): Promise<ISttTranscribeResult>;
}

const KNOWN_CODES: readonly string[] = [
  "NO_ADAPTER",
  "NO_PLATFORM",
  "EMPTY_AUDIO",
  "RECORDING_TOO_SHORT",
  "AUDIO_TOO_LARGE",
  "UNSUPPORTED_MEDIA",
  "MIC_PERMISSION_DENIED",
  "MIC_UNAVAILABLE",
  "RECORDING_UNSUPPORTED",
  "BAD_TOKEN",
  "MODEL_NOT_FOUND",
  "LANGUAGE_UNSUPPORTED",
  "ENGINE_UNAVAILABLE",
  "RETRYABLE",
  "TIMEOUT",
  "ENGINE_REJECTED_INPUT",
  "TRANSCRIPTION_FAILED",
];

export function isSttErrorCode(value: unknown): value is SttErrorCode {
  return typeof value === "string" && KNOWN_CODES.includes(value);
}
export interface ISttRealtimeInput {
  model?: string;
  language?: string;
  signal?: AbortSignal;
}

export interface ISttRealtimeSession {
  readonly capabilities: ISttCapabilities;
  feedPcm16(pcm: Uint8Array): void;
  onDelta(handler: (delta: string, fullText: string) => void): void;
  onError(handler: (errorCode: SttErrorCode, message?: string) => void): void;
  stop(): Promise<ISttTranscribeResult>;
  release(): void;
}

export interface ISttRealtimeAdapter {
  capabilities: ISttCapabilities;
  openRealtime(input: ISttRealtimeInput): Promise<ISttRealtimeResult>;
}

export type ISttRealtimeResult =
  { ok: true; session: ISttRealtimeSession } | { ok: false; errorCode: SttErrorCode; message?: string };
