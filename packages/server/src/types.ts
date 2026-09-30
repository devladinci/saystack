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
import type { Context } from "hono";
import type { UpgradeWebSocket } from "hono/ws";

export type ServerErrorCode = "BAD_SETTINGS" | SttErrorCode;

export interface IRealtimeRouteDeps {
  upgradeWebSocket: UpgradeWebSocket;
  createAdapter: (engineConfig: ISttEngineConfig) => ISttRealtimeAdapter;
  // Browsers cannot set headers on a WebSocket, so HTTP auth middleware never sees one; check the
  // upgrade request here (a query token, a cookie). A refused socket gets BAD_TOKEN and closes with 4001.
  authorize?: (c: Context) => boolean | Promise<boolean>;
  maxBytes?: number;
  finalPass?: boolean;
}

export interface IVoiceServerDeps {
  getSettings: () => IValidationResult;
  createSttAdapter: (engineConfig: ISttEngineConfig) => ISttAdapter;
  createTtsAdapter: (engineConfig: ITtsEngineConfig) => ITtsAdapter;
  realtime?: IRealtimeRouteDeps;
  maxBodyBytes?: number;
  maxTextChars?: number;
  // Any origin by default; false leaves CORS to the host app.
  cors?: { origin: string | string[] } | false;
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
  | { ok: true; audio: Uint8Array; mimeType?: string; filename?: string; prompt?: string; language?: string }
  | { ok: false; errorCode: SttErrorCode; message?: string };
