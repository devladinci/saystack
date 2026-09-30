import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { capturePcm } from "../src/pcmCapture.js";
import { startRealtimeTranscription } from "../src/realtimeTranscription.js";

interface IFakeProcessor {
  onaudioprocess: ((event: { inputBuffer: { getChannelData: () => Float32Array } }) => void) | null;
}

const node = () => ({ connect: () => undefined, disconnect: () => undefined });

function fakeMicContext(sampleRate = 48000) {
  const processors: IFakeProcessor[] = [];
  const context = {
    sampleRate,
    state: "running",
    destination: node(),
    resume: async () => undefined,
    createMediaStreamSource: () => node(),
    createGain: () => ({ ...node(), gain: { value: 1 } }),
    createScriptProcessor: () => {
      const processor: IFakeProcessor & ReturnType<typeof node> = { ...node(), onaudioprocess: null };
      processors.push(processor);

      return processor;
    },
  };

  const speak = (samples: Float32Array): void => {
    for (const processor of processors) {
      processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => samples } });
    }
  };

  return { context: context as unknown as AudioContext, speak };
}

class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static last: FakeSocket | null = null;

  readonly url: string;
  readyState = FakeSocket.CONNECTING;
  binaryType = "blob";
  sent: (string | Uint8Array)[] = [];
  private listeners = new Map<string, ((event: { data?: unknown }) => void)[]>();

  constructor(url: string) {
    this.url = url;
    FakeSocket.last = this;
  }

  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(data: string | Uint8Array): void {
    this.sent.push(data);
  }

  close(): void {
    if (this.readyState === FakeSocket.CLOSED) {
      return;
    }

    this.readyState = FakeSocket.CLOSED;
    this.emit("close");
  }

  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.emit("open");
  }

  reply(message: Record<string, unknown>): void {
    this.emit("message", { data: JSON.stringify(message) });
  }

  texts(): Record<string, unknown>[] {
    return this.sent.filter((item): item is string => typeof item === "string").map((item) => JSON.parse(item) as Record<string, unknown>);
  }

  audio(): Uint8Array[] {
    return this.sent.filter((item): item is Uint8Array => typeof item !== "string");
  }

  private emit(type: string, event: { data?: unknown } = {}): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const tone = (length: number, value = 0.5) => new Float32Array(length).fill(value);

describe("capturePcm", () => {
  it("sends 16 kHz little-endian chunks and flushes the rest on stop", async () => {
    const mic = fakeMicContext();
    const chunks: Uint8Array[] = [];
    const capture = capturePcm({} as MediaStream, { onChunk: (pcm) => chunks.push(pcm), context: mic.context });

    await settle();
    mic.speak(tone(4800 + 300));
    capture.stop();
    mic.speak(tone(4800));

    expect(chunks.map((chunk) => chunk.byteLength)).toEqual([3200, 200]);
    expect(new DataView(chunks[0]?.buffer ?? new ArrayBuffer(2)).getInt16(0, true)).toBe(Math.floor(0.5 * 0x7fff));
  });
});

describe("startRealtimeTranscription", () => {
  beforeEach(() => {
    vi.stubGlobal("WebSocket", FakeSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    FakeSocket.last = null;
  });

  const start = (options: { language?: string; finishTimeoutMs?: number } = {}) => {
    const mic = fakeMicContext();
    const heard: string[] = [];
    const dictation = startRealtimeTranscription({
      url: "ws://daemon/stt/stream?token=t",
      stream: () => ({}) as MediaStream,
      onText: (text) => heard.push(text),
      params: { model: "whisper" },
      context: mic.context,
      ...options,
    });
    const socket = FakeSocket.last;

    if (socket === null) {
      throw new Error("no socket");
    }

    return { dictation, socket, mic, heard };
  };

  it("holds the audio until the engine is ready, then streams the words", async () => {
    const { dictation, socket, mic, heard } = start({ language: "en" });

    socket.open();
    await settle();
    mic.speak(tone(4800));

    expect(socket.texts()).toEqual([{ model: "whisper", type: "start", language: "en" }]);
    expect(socket.audio()).toHaveLength(0);

    socket.reply({ type: "ready" });
    mic.speak(tone(4800));
    socket.reply({ type: "transcript.delta", delta: " Hello" });
    socket.reply({ type: "transcript.delta", delta: " there." });

    expect(dictation.isLive).toBe(true);
    expect(socket.audio().map((pcm) => pcm.byteLength)).toEqual([3200, 3200]);
    expect(heard).toEqual(["Hello", "Hello there."]);

    const finished = dictation.finish();

    expect(socket.texts().at(-1)).toEqual({ type: "stop" });

    socket.reply({ type: "transcript.done", text: " Hello there." });

    await expect(finished).resolves.toBe("Hello there.");
    expect(socket.readyState).toBe(FakeSocket.CLOSED);
  });

  it("stops only after the engine is ready when the press ends first", async () => {
    const { dictation, socket, mic } = start();

    socket.open();
    await settle();
    mic.speak(tone(2400));
    const finished = dictation.finish();

    expect(socket.texts()).toEqual([{ model: "whisper", type: "start" }]);

    socket.reply({ type: "ready" });

    expect(socket.audio().map((pcm) => pcm.byteLength)).toEqual([1600]);
    expect(socket.texts().at(-1)).toEqual({ type: "stop" });

    socket.reply({ type: "transcript.done", text: "Short one." });

    await expect(finished).resolves.toBe("Short one.");
  });

  it("gives up when the engine cannot stream", async () => {
    const { dictation, socket } = start();

    socket.open();
    socket.reply({ type: "error", detail: "Model does not support realtime transcription." });

    await expect(dictation.finish()).resolves.toBeNull();
    expect(dictation.isLive).toBe(false);
  });

  it("gives up when the connection drops before the last words", async () => {
    const { dictation, socket } = start();

    socket.open();
    socket.reply({ type: "ready" });
    socket.reply({ type: "transcript.delta", delta: " Half a" });
    const finished = dictation.finish();
    socket.close();

    await expect(finished).resolves.toBeNull();
  });

  it("gives up when the last words take too long", async () => {
    vi.useFakeTimers();
    const { dictation, socket } = start({ finishTimeoutMs: 1000 });

    socket.open();
    socket.reply({ type: "ready" });
    const finished = dictation.finish();
    vi.advanceTimersByTime(1000);

    await expect(finished).resolves.toBeNull();
    expect(socket.readyState).toBe(FakeSocket.CLOSED);
  });

  it("drops everything on cancel", async () => {
    const { dictation, socket, mic } = start();

    socket.open();
    socket.reply({ type: "ready" });
    await settle();
    dictation.cancel();
    mic.speak(tone(4800));

    expect(socket.readyState).toBe(FakeSocket.CLOSED);
    expect(socket.audio()).toHaveLength(0);
    await expect(dictation.finish()).resolves.toBeNull();
  });
});
