import type { ISpeechEnvelope, ISpeechMark, IWordTiming } from "./timing.js";

export type TtsErrorCode =
  | "NO_ADAPTER"
  | "EMPTY_TEXT"
  | "TEXT_TOO_LONG"
  | "MODEL_NOT_FOUND"
  | "BAD_TOKEN"
  | "TTS_UNAVAILABLE"
  | "TTS_REJECTED_INPUT"
  | "TTS_RETRYABLE"
  | "TTS_FAILED"
  | "TTS_TIMEOUT"
  | "TTS_UNSUPPORTED_MEDIA";

export type TtsPhase = "idle" | "loading" | "playing" | "paused" | "done" | "error";

export interface ITtsCapabilities {
  streaming: boolean;
  voiceCloning: boolean;
}

export interface ITtsSynthesizeInput {
  text: string;
  refAudio?: string;
  refText?: string;
  signal?: AbortSignal;
}

export type ITtsSynthesizeResult =
  | { ok: true; audio: ArrayBuffer; mimeType: string; marks?: readonly ISpeechMark[] }
  | { ok: false; errorCode: TtsErrorCode; message: string };

export interface ITtsAdapter {
  readonly capabilities: ITtsCapabilities;
  synthesize(input: ITtsSynthesizeInput): Promise<ITtsSynthesizeResult>;
}

export interface ISpeechClip {
  // play must settle once stop or release is called — awaiting this may never hang after stop
  play: () => Promise<void>;
  stop: () => void;
  release: () => void;
  pause?: () => void;
  resume?: () => void;
  seek?: (seconds: number) => void;
  readonly duration?: number;
  readonly currentTime?: number;
  readonly envelope?: ISpeechEnvelope;
}

export type ISpeechClipResult =
  | { ok: true; clip: ISpeechClip }
  | { ok: false; errorCode: TtsErrorCode; message: string };

export interface ITtsDriver {
  unlock?: () => void;
  synthesize: (input: ITtsSynthesizeInput) => Promise<ITtsSynthesizeResult>;
  createClip: (audio: ArrayBuffer) => Promise<ISpeechClipResult>;
}

export interface ISpeechChunk {
  text: string;
  words: readonly IWordTiming[];
  duration: number;
}

export interface ISpeechState {
  phase: TtsPhase;
  text: string;
  errorCode: TtsErrorCode | null;
  errorMessage: string | null;
  chunks: readonly ISpeechChunk[];
  chunkIndex: number;
}

export interface ISpeechPosition {
  chunkIndex: number;
  time: number;
  duration: number;
  wordIndex: number;
}
