import type {
  IConfigError,
  ISttAdapter,
  ISttCapabilities,
  ISttEngineConfig,
  ISttRealtimeAdapter,
  ITtsAdapter,
  ITtsEngineConfig,
  IValidationResult,
  SttErrorCode,
} from "@saystack/core";
import type { UpgradeWebSocket } from "hono/ws";

export type ServerErrorCode = "BAD_SETTINGS" | SttErrorCode;

export interface IRealtimeRouteDeps {
  upgradeWebSocket: UpgradeWebSocket;
  createAdapter: (engineConfig: ISttEngineConfig) => ISttRealtimeAdapter;
  maxBytes?: number;
  finalPass?: boolean;
}

export interface IVoiceServerDeps {
  getSettings: () => IValidationResult;
  createSttAdapter: (engineConfig: ISttEngineConfig) => ISttAdapter;
  createTtsAdapter: (engineConfig: ITtsEngineConfig) => ITtsAdapter;
  realtime?: IRealtimeRouteDeps;
  maxBodyBytes?: number;
  cors?: { origin: string | string[] } | undefined;
}

export interface ICapabilitiesResponse {
  stt: ISttCapabilities;
}

export interface ITranscriptionResponse {
  text: string;
  language?: string;
  durationSeconds?: number;
}

export interface IErrorResponse {
  errorCode: ServerErrorCode;
  message?: string;
  errors?: readonly IConfigError[];
}

export type IAudioReadResult =
  | { ok: true; audio: Uint8Array; mimeType?: string; filename?: string; prompt?: string }
  | { ok: false; errorCode: SttErrorCode; message?: string };
