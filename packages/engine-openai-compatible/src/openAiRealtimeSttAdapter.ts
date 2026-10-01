import type {
  ISttCapabilities,
  ISttRealtimeAdapter,
  ISttRealtimeInput,
  ISttRealtimeResult,
  ISttRealtimeSession,
  ISttTranscribeResult,
  SttErrorCode,
} from "@saystack/core";
import { REALTIME_PCM_RATE, createPcm16Chunker, createResampler, pcm16ToFloat } from "@saystack/core";
import { WebSocket } from "ws";

import { normalizeBaseUrl } from "./sttAdapter.js";

export interface IOpenAiRealtimeOptions {
  model?: string;
  handshakeTimeoutMs?: number;
  stopTimeoutMs?: number;
}

interface IRealtimeError {
  code?: unknown;
  message?: unknown;
}

interface IRealtimeEvent {
  type?: unknown;
  delta?: unknown;
  transcript?: unknown;
  error?: IRealtimeError;
}

type Phase = "opening" | "open" | "stopping" | "over";

const SERVER_RATE = 24000;

const CAPABILITIES: ISttCapabilities = {
  streaming: true,
  interimResults: true,
  wordTimings: false,
  languages: [],
};

// gpt-transcribe and gpt-live-transcribe take a list of likely languages; the older models take one.
const takesLanguageList = (model: string): boolean =>
  model.startsWith("gpt-transcribe") || model.startsWith("gpt-live-transcribe");

const wsUrlFor = (baseUrl: string): string => {
  const http = new URL(normalizeBaseUrl(baseUrl));
  const wsProtocol = http.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${http.host}${http.pathname.replace(/\/+$/, "")}/realtime?intent=transcription`;
};

const errorForCode = (code: string, message: string): SttErrorCode => {
  const text = `${code} ${message}`.toLowerCase();
  if (text.includes("api_key") || text.includes("api key") || text.includes("unauthorized")) return "BAD_TOKEN";
  if (text.includes("model")) return "MODEL_NOT_FOUND";
  return "ENGINE_REJECTED_INPUT";
};

const errorForUpgrade = (message: string): SttErrorCode => {
  if (/\b40[13]\b/.test(message)) return "BAD_TOKEN";
  return "ENGINE_UNAVAILABLE";
};

const readEvent = (raw: string): IRealtimeEvent => {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as IRealtimeEvent) : {};
  } catch {
    return {};
  }
};

const createUpsampler = (): ((pcm: Uint8Array) => Buffer) => {
  const resample = createResampler(REALTIME_PCM_RATE, SERVER_RATE);
  const parts: Uint8Array[] = [];
  const chunker = createPcm16Chunker({ onChunk: (chunk) => parts.push(chunk), sampleRate: SERVER_RATE });

  return (pcm) => {
    chunker.push(resample(pcm16ToFloat(pcm)));
    chunker.flush();
    return Buffer.concat(parts.splice(0));
  };
};

// The OpenAI Realtime transcription protocol: a transcription session.update, base64 24 kHz PCM16 appends,
// then one commit whose .completed event carries the final transcript. OpenAI, speaches and others speak it.
export function createOpenAiRealtimeSttAdapter(
  engine: { url: string; token?: string; model?: string },
  { model: defaultModel, handshakeTimeoutMs = 10_000, stopTimeoutMs = 10_000 }: IOpenAiRealtimeOptions = {},
): ISttRealtimeAdapter {
  const openRealtime = (input: ISttRealtimeInput): Promise<ISttRealtimeResult> =>
    new Promise((resolveOpen) => {
      const model = input.model ?? defaultModel ?? engine.model;

      if (model === undefined) {
        resolveOpen({ ok: false, errorCode: "MODEL_NOT_FOUND", message: "no realtime transcription model is set" });
        return;
      }

      const socket = new WebSocket(
        wsUrlFor(engine.url),
        engine.token === undefined ? {} : { headers: { Authorization: `Bearer ${engine.token}` } },
      );
      const upsample = createUpsampler();
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
            const audio = upsample(pcm);
            if (audio.byteLength > 0) {
              socket.send(JSON.stringify({ type: "input_audio_buffer.append", audio: audio.toString("base64") }));
            }
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
            socket.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
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

      const language =
        input.language === undefined
          ? {}
          : takesLanguageList(model)
            ? { languages: [input.language] }
            : { language: input.language };

      socket.on("open", () => {
        socket.send(
          JSON.stringify({
            type: "session.update",
            session: {
              type: "transcription",
              audio: {
                input: {
                  format: { type: "audio/pcm", rate: SERVER_RATE },
                  transcription: { model, ...language },
                  turn_detection: null,
                },
              },
            },
          }),
        );
      });

      socket.on("message", (data: WebSocket.RawData) => {
        const event = readEvent(data.toString());

        if (event.type === "session.updated" && phase === "opening") {
          clearTimeout(handshakeTimer);
          phase = "open";
          resolveOpen({ ok: true, session });
          return;
        }

        if (
          event.type === "conversation.item.input_audio_transcription.delta" &&
          typeof event.delta === "string" &&
          phase !== "over"
        ) {
          text += event.delta;
          handleDelta?.(event.delta, text);
          return;
        }

        if (event.type === "conversation.item.input_audio_transcription.completed" && phase !== "over") {
          settle({ ok: true, text: typeof event.transcript === "string" ? event.transcript : text });
          return;
        }

        if (event.type === "conversation.item.input_audio_transcription.failed") {
          const message = typeof event.error?.message === "string" ? event.error.message : "transcription failed";
          fail("TRANSCRIPTION_FAILED", message);
          return;
        }

        if (event.type === "error") {
          const code = typeof event.error?.code === "string" ? event.error.code : "";
          const message = typeof event.error?.message === "string" ? event.error.message : "realtime rejected";

          // Stopping with nothing said: an empty buffer cannot be committed, and that is an empty transcript.
          if (phase === "stopping" && code === "input_audio_buffer_commit_empty") {
            settle({ ok: true, text });
            return;
          }

          fail(errorForCode(code, message), message);
        }
      });

      socket.on("error", (error: Error) => {
        fail(phase === "opening" ? errorForUpgrade(error.message) : "ENGINE_UNAVAILABLE", error.message);
      });

      socket.on("close", () => {
        fail("ENGINE_UNAVAILABLE", "the stream closed before the transcript was done");
      });
    });

  return { capabilities: CAPABILITIES, openRealtime };
}
