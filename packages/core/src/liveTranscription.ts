import type { ILiveTranscription } from "./dictation.js";

// 16 kHz mono PCM16, little-endian, until the returned stop is called.
export interface IPcmSource {
  start(onChunk: (pcm: Uint8Array<ArrayBuffer>) => void): () => void;
}

export interface ILiveTranscriptionOptions {
  url: string;
  source: IPcmSource;
  onText: (text: string) => void;
  onReady?: () => void;
  language?: string;
  params?: Readonly<Record<string, unknown>>;
  finishTimeoutMs?: number;
}

interface IServerMessage {
  type?: unknown;
  delta?: unknown;
  text?: unknown;
}

const openSocket = (url: string): WebSocket | null => {
  try {
    const socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";

    return socket;
  } catch {
    return null;
  }
};

const readMessage = (data: unknown): IServerMessage => {
  if (typeof data !== "string") {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(data);

    return typeof parsed === "object" && parsed !== null ? (parsed as IServerMessage) : {};
  } catch {
    return {};
  }
};

// The realtime transcription protocol: a start message, 16 kHz mono PCM16 frames, then stop.
export function startLiveTranscription({
  url,
  source,
  onText,
  onReady,
  language,
  params = {},
  finishTimeoutMs = 8000,
}: ILiveTranscriptionOptions): ILiveTranscription {
  const socket = openSocket(url);
  const backlog: Uint8Array<ArrayBuffer>[] = [];
  const settles: ((text: string | null) => void)[] = [];
  let outcome: string | null | undefined;
  let isLive = false;
  let isStopping = false;
  let text = "";
  let stopSource: (() => void) | null = null;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const stopCapture = (): void => {
    const stop = stopSource;
    stopSource = null;
    stop?.();
  };

  const end = (result: string | null): void => {
    if (outcome !== undefined) {
      return;
    }

    outcome = result;
    clearTimeout(timeout);
    stopCapture();
    backlog.length = 0;

    if (socket !== null && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
      socket.close();
    }

    for (const settle of settles.splice(0)) {
      settle(result);
    }
  };

  const send = (pcm: Uint8Array<ArrayBuffer>): void => {
    if (outcome !== undefined) {
      return;
    }

    if (isLive && socket?.readyState === WebSocket.OPEN) {
      socket.send(pcm);
      return;
    }

    backlog.push(pcm);
  };

  const sendStop = (): void => {
    if (isLive && socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "stop" }));
    }
  };

  stopSource = source.start(send);

  if (socket === null) {
    end(null);
  } else {
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ ...params, type: "start", ...(language === undefined ? {} : { language }) }));
    });

    socket.addEventListener("message", (event) => {
      const message = readMessage(event.data);

      if (message.type === "ready") {
        isLive = true;
        onReady?.();

        for (const pcm of backlog.splice(0)) {
          socket.send(pcm);
        }

        if (isStopping) {
          sendStop();
        }

        return;
      }

      if (message.type === "transcript.delta" && typeof message.delta === "string") {
        text += message.delta;
        onText(text.trim());
        return;
      }

      if (message.type === "transcript.done") {
        end(typeof message.text === "string" ? message.text.trim() : text.trim());
        return;
      }

      if (message.type === "error") {
        end(null);
      }
    });

    socket.addEventListener("close", () => end(null));
  }

  return {
    get isLive() {
      return isLive;
    },
    finish() {
      if (outcome !== undefined) {
        return Promise.resolve(outcome);
      }

      if (!isStopping) {
        isStopping = true;
        stopCapture();
        sendStop();
        timeout = setTimeout(() => end(null), finishTimeoutMs);
      }

      return new Promise((resolve) => {
        settles.push(resolve);
      });
    },
    cancel() {
      end(null);
    },
  };
}
