import type {
  ISttCapabilities,
  ISttRealtimeAdapter,
  ISttRealtimeInput,
  ISttRealtimeResult,
  ISttRealtimeSession,
  ISttTranscribeResult,
  SttErrorCode,
} from "@saystack/core";
import { WebSocket } from "ws";

export interface IOmlxRealtimeOptions {
  model?: string;
  handshakeTimeoutMs?: number;
  stopTimeoutMs?: number;
}

interface IRealtimeMessage {
  type?: unknown;
  delta?: unknown;
  text?: unknown;
  detail?: unknown;
}

type Phase = "opening" | "open" | "stopping" | "over";

const DEFAULT_MODEL = "whisper-large-v3-turbo";

const wsUrlFor = (baseUrl: string): string => {
  const http = new URL(baseUrl);
  const wsProtocol = http.protocol === "https:" ? "wss:" : "ws:";
  const path = `${http.pathname.replace(/\/+$/, "")}/audio/transcriptions/realtime`;
  return `${wsProtocol}//${http.host}${path}`;
};

const errorForDetail = (detail: string): SttErrorCode => {
  const lowered = detail.toLowerCase();
  if (lowered.includes("api key")) return "BAD_TOKEN";
  if (lowered.includes("not support realtime")) return "MODEL_NOT_FOUND";
  if (lowered.includes("not a speech-to-text")) return "MODEL_NOT_FOUND";
  return "ENGINE_REJECTED_INPUT";
};

const readMessage = (raw: string): IRealtimeMessage => {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as IRealtimeMessage) : {};
  } catch {
    return {};
  }
};

const WHISPER_LANGUAGES: readonly string[] = [
  "af",
  "am",
  "ar",
  "as",
  "az",
  "ba",
  "be",
  "bg",
  "bn",
  "bo",
  "br",
  "bs",
  "ca",
  "cs",
  "cy",
  "da",
  "de",
  "el",
  "en",
  "es",
  "et",
  "eu",
  "fa",
  "fi",
  "fo",
  "fr",
  "gl",
  "gu",
  "haw",
  "ha",
  "he",
  "hi",
  "hr",
  "ht",
  "hu",
  "hy",
  "id",
  "is",
  "it",
  "ja",
  "jw",
  "ka",
  "kk",
  "km",
  "kn",
  "ko",
  "la",
  "lb",
  "ln",
  "lo",
  "lt",
  "lv",
  "mg",
  "mi",
  "mk",
  "ml",
  "mn",
  "mr",
  "ms",
  "mt",
  "my",
  "ne",
  "nl",
  "nn",
  "no",
  "oc",
  "pa",
  "pl",
  "ps",
  "pt",
  "ro",
  "ru",
  "sa",
  "sd",
  "si",
  "sk",
  "sl",
  "sn",
  "so",
  "sq",
  "sr",
  "su",
  "sv",
  "sw",
  "ta",
  "te",
  "tg",
  "th",
  "tk",
  "tl",
  "tr",
  "tt",
  "uk",
  "ur",
  "uz",
  "vi",
  "yi",
  "yo",
  "yue",
  "zh",
];

const CAPABILITIES: ISttCapabilities = {
  streaming: true,
  interimResults: true,
  wordTimings: false,
  languages: WHISPER_LANGUAGES,
};

// oMLX's push protocol: {"type":"start"} (the key rides in it; a handshake carries no headers), binary 16 kHz mono PCM16, then {"type":"stop"}.
export function createOmlxRealtimeSttAdapter(
  engine: { url: string; token?: string; model?: string },
  { model: defaultModel, handshakeTimeoutMs = 10_000, stopTimeoutMs = 5_000 }: IOmlxRealtimeOptions = {},
): ISttRealtimeAdapter {
  const openRealtime = (input: ISttRealtimeInput): Promise<ISttRealtimeResult> =>
    new Promise((resolveOpen) => {
      const model = input.model ?? defaultModel ?? engine.model ?? DEFAULT_MODEL;
      const socket = new WebSocket(wsUrlFor(engine.url));
      let phase: Phase = "opening";
      let text = "";
      let outcome: ISttTranscribeResult | null = null;
      let handleDelta: ((delta: string, fullText: string) => void) | null = null;
      let handleError: ((errorCode: SttErrorCode, message?: string) => void) | null = null;
      const settles: ((result: ISttTranscribeResult) => void)[] = [];
      let stopTimer: ReturnType<typeof setTimeout> | undefined;

      const close = (): void => {
        clearTimeout(handshakeTimer);
        clearTimeout(stopTimer);
        if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      };

      const settle = (result: ISttTranscribeResult): void => {
        outcome = result;
        phase = "over";
        close();
        for (const resolve of settles.splice(0)) {
          resolve(result);
        }
      };

      const refuse = (errorCode: SttErrorCode, message: string): void => {
        phase = "over";
        close();
        resolveOpen({ ok: false, errorCode, message });
      };

      const fail = (errorCode: SttErrorCode, message: string): void => {
        if (phase === "opening") {
          refuse(errorCode, message);
          return;
        }

        if (phase === "over") {
          return;
        }

        handleError?.(errorCode, message);
        settle({ ok: false, errorCode, message });
      };

      const session: ISttRealtimeSession = {
        capabilities: CAPABILITIES,
        feedPcm16: (pcm) => {
          if (phase === "open" && socket.readyState === WebSocket.OPEN) {
            socket.send(pcm, { binary: true });
          }
        },
        onDelta: (handler) => {
          handleDelta = handler;
        },
        onError: (handler) => {
          handleError = handler;
        },
        stop: () => {
          if (outcome !== null) {
            return Promise.resolve(outcome);
          }

          if (phase === "open") {
            phase = "stopping";
            socket.send(JSON.stringify({ type: "stop" }));
            stopTimer = setTimeout(() => fail("TIMEOUT", "the transcript did not finish in time"), stopTimeoutMs);
          }

          return new Promise((resolve) => {
            settles.push(resolve);
          });
        },
        release: () => {
          if (phase !== "over") {
            settle({ ok: false, errorCode: "TRANSCRIPTION_FAILED", message: "the stream was released" });
          }
        },
      };

      const handshakeTimer = setTimeout(() => {
        if (phase === "opening") {
          refuse("TIMEOUT", "realtime handshake timed out");
        }
      }, handshakeTimeoutMs);

      socket.on("open", () => {
        socket.send(
          JSON.stringify({
            type: "start",
            model,
            api_key: engine.token ?? "",
            ...(input.language === undefined ? {} : { language: input.language }),
          }),
        );
      });

      socket.on("message", (data: WebSocket.RawData, isBinary: boolean) => {
        if (isBinary) {
          return;
        }

        const message = readMessage(data.toString());

        if (message.type === "ready" && phase === "opening") {
          clearTimeout(handshakeTimer);
          phase = "open";
          resolveOpen({ ok: true, session });
          return;
        }

        if (message.type === "transcript.delta" && typeof message.delta === "string" && phase !== "over") {
          text += message.delta;
          handleDelta?.(message.delta, text);
          return;
        }

        if (message.type === "transcript.done" && phase !== "over") {
          settle({ ok: true, text: typeof message.text === "string" ? message.text : text });
          return;
        }

        if (message.type === "error") {
          const detail =
            typeof message.detail === "string" && message.detail !== "" ? message.detail : "realtime rejected";
          fail(errorForDetail(detail), detail);
        }
      });

      socket.on("error", (error: Error) => {
        fail("ENGINE_UNAVAILABLE", error.message);
      });

      socket.on("close", () => {
        fail("ENGINE_UNAVAILABLE", "the stream closed before the transcript was done");
      });
    });

  return { capabilities: CAPABILITIES, openRealtime };
}
