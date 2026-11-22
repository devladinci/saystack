import type { ISttRealtimeResult, ISttRealtimeSession, ISttTranscribeResult, SttErrorCode } from "@saystack/core";
import { pcm16ToWav } from "@saystack/core";
import type { WSContext, WSEvents } from "hono/ws";

export interface IRealtimeStart {
  language?: string;
  // What the conversation has been about, for refine.
  context?: string;
}

export interface IRealtimeBridgeOptions {
  maxBytes?: number;
  finalize?: (wav: Uint8Array) => Promise<ISttTranscribeResult>;
  // The last word on the final text, such as a cleanup. It must return the text it was given when it cannot improve it.
  refine?: (text: string, start: IRealtimeStart, signal: AbortSignal) => Promise<string>;
}

interface IClientMessage {
  type?: unknown;
  language?: unknown;
  context?: unknown;
  waitMs?: unknown;
}

// The final text has to reach the client before it gives up waiting, so refine stops this long before that.
const REPLY_MARGIN_MS = 750;
const MIN_REFINE_MS = 250;

// 16 kHz mono PCM16 is 32 KB a second: about thirteen minutes, like the upload limit.
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

const readMessage = (raw: string): IClientMessage => {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as IClientMessage) : {};
  } catch {
    return {};
  }
};

const send = (ws: WSContext, message: Record<string, unknown>): void => {
  ws.send(JSON.stringify(message));
};

// One WebSocket connection of the realtime transcription protocol, for Hono's upgradeWebSocket.
// With finalize, the last text comes from one pass over the whole recording: a stream's closing
// flush can revise its last words and echo them (oMLX's Whisper does).
export function createRealtimeBridge(
  open: (start: IRealtimeStart) => Promise<ISttRealtimeResult>,
  { maxBytes = DEFAULT_MAX_BYTES, finalize, refine }: IRealtimeBridgeOptions = {},
): WSEvents {
  const closed = new AbortController();
  let started: IRealtimeStart = {};
  let session: ISttRealtimeSession | null = null;
  let isStarted = false;
  let isStopping = false;
  let isOver = false;
  let received = 0;
  const recording: Uint8Array[] = [];

  const fail = (ws: WSContext, errorCode: SttErrorCode, detail?: string): void => {
    if (isOver) {
      return;
    }

    isOver = true;
    send(ws, { type: "error", errorCode, detail: detail ?? errorCode });
    ws.close(1011, "transcription failed");
    session?.release();
  };

  const start = async (ws: WSContext): Promise<void> => {
    const result = await open(started);

    if (isOver) {
      if (result.ok) {
        result.session.release();
      }
      return;
    }

    if (!result.ok) {
      fail(ws, result.errorCode, result.message);
      return;
    }

    session = result.session;
    session.onDelta((delta) => {
      if (!isOver && !(isStopping && finalize !== undefined)) {
        send(ws, { type: "transcript.delta", delta });
      }
    });
    session.onError((errorCode, message) => fail(ws, errorCode, message));
    send(ws, { type: "ready" });
  };

  // The time refine may take: until the client stops waiting, when it said how long that is.
  const refineSignal = (stoppedAt: number, waitMs: number | undefined): AbortSignal | null => {
    if (waitMs === undefined) {
      return closed.signal;
    }

    const left = waitMs - REPLY_MARGIN_MS - (Date.now() - stoppedAt);

    return left < MIN_REFINE_MS ? null : AbortSignal.any([closed.signal, AbortSignal.timeout(left)]);
  };

  const stop = async (ws: WSContext, current: ISttRealtimeSession, waitMs: number | undefined): Promise<void> => {
    const stoppedAt = Date.now();
    isStopping = true;
    const [streamed, final] = await Promise.all([
      current.stop(),
      finalize === undefined ? Promise.resolve(null) : finalize(pcm16ToWav(recording)),
    ]);
    const result = final !== null && final.ok ? final : streamed;

    if (isOver) {
      return;
    }

    if (!result.ok) {
      fail(ws, result.errorCode, result.message);
      return;
    }

    const signal = refine === undefined ? null : refineSignal(stoppedAt, waitMs);
    const text =
      refine === undefined || signal === null
        ? result.text
        : await refine(result.text, started, signal).catch(() => result.text);

    if (isOver) {
      return;
    }

    isOver = true;
    send(ws, { type: "transcript.done", text });
    ws.close(1000, "done");
  };

  return {
    onMessage(event, ws) {
      if (isOver) {
        return;
      }

      if (typeof event.data === "string") {
        const message = readMessage(event.data);

        if (message.type === "start" && !isStarted) {
          isStarted = true;
          started = {
            ...(typeof message.language === "string" ? { language: message.language } : {}),
            ...(typeof message.context === "string" && message.context.trim() !== ""
              ? { context: message.context }
              : {}),
          };
          void start(ws);
          return;
        }

        if (message.type === "stop" && session !== null && !isStopping) {
          const { waitMs } = message;

          void stop(
            ws,
            session,
            typeof waitMs === "number" && Number.isFinite(waitMs) && waitMs > 0 ? waitMs : undefined,
          );
        }

        return;
      }

      if (session === null || !(event.data instanceof ArrayBuffer)) {
        return;
      }

      received += event.data.byteLength;

      if (received > maxBytes) {
        fail(ws, "AUDIO_TOO_LARGE", "the recording is too long");
        return;
      }

      const pcm = new Uint8Array(event.data);
      session.feedPcm16(pcm);

      if (finalize !== undefined) {
        recording.push(pcm);
      }
    },
    onClose() {
      isOver = true;
      closed.abort();
      session?.release();
      session = null;
    },
  };
}
