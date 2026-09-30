import { pcm16ToWav } from "@saystack/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const files = vi.hoisted(() => new Map<string, Uint8Array>());

const audio = vi.hoisted(() => {
  const streams: {
    started: boolean;
    stopped: boolean;
    emit: (samples: Float32Array) => void;
    resolveStart: () => void;
  }[] = [];

  class FakeStream {
    private listener:
      ((buffer: { data: ArrayBuffer; sampleRate: number; channels: number; timestamp: number }) => void) | null = null;
    private handle: {
      started: boolean;
      stopped: boolean;
      emit: (samples: Float32Array) => void;
      resolveStart: () => void;
    };

    constructor() {
      this.handle = {
        started: false,
        stopped: false,
        emit: (samples) =>
          this.listener?.({ data: samples.slice().buffer, sampleRate: 16000, channels: 1, timestamp: 0 }),
        resolveStart: () => undefined,
      };
      streams.push(this.handle);
    }

    addListener(_event: string, listener: FakeStream["listener"]) {
      this.listener = listener;

      return { remove: () => undefined };
    }

    start() {
      this.handle.started = true;

      return new Promise<void>((resolve) => {
        this.handle.resolveStart = resolve;
      });
    }

    stop() {
      this.handle.stopped = true;
    }

    release() {
      this.listener = null;
    }
  }

  return { streams, FakeStream, granted: true };
});

vi.mock("expo-file-system", () => {
  class File {
    readonly uri: string;

    constructor(_directory: unknown, name: string) {
      this.uri = `file:///cache/${name}`;
    }

    get exists() {
      return files.has(this.uri);
    }

    create() {
      files.set(this.uri, new Uint8Array(0));
    }

    write(content: Uint8Array) {
      files.set(this.uri, content);
    }

    delete() {
      files.delete(this.uri);
    }
  }

  return { File, Paths: { cache: {} } };
});

vi.mock("expo-audio", () => ({
  AudioModule: { AudioStream: audio.FakeStream },
  requestRecordingPermissionsAsync: async () => ({ granted: audio.granted }),
  setAudioModeAsync: async () => undefined,
}));

const { createClipRecorder } = await import("../src/audio/clipRecorder.js");
const { createNativeRecorder } = await import("../src/audio/nativeRecorder.js");

const tone = (length: number, rate = 16000): Float32Array =>
  Float32Array.from({ length }, (_, index) => 0.5 * Math.sin((2 * Math.PI * 440 * index) / rate));

const wavOf = (samples: Float32Array): ArrayBuffer => {
  const pcm = new Uint8Array(samples.length * 2);
  const view = new DataView(pcm.buffer);
  samples.forEach((value, index) => view.setInt16(index * 2, Math.round(value * 0x7fff), true));

  return pcm16ToWav([pcm], 16000).buffer;
};

beforeEach(() => {
  files.clear();
  audio.streams.length = 0;
  audio.granted = true;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createClipRecorder", () => {
  it("plays the clip in real time, as 100 ms chunks, and keeps it as a WAV", async () => {
    vi.useFakeTimers();
    const recorder = createClipRecorder({ load: async () => wavOf(tone(4000)) });
    const chunks: number[] = [];
    recorder.pcm.start((pcm) => chunks.push(pcm.byteLength));

    await recorder.startRecording();
    vi.advanceTimersByTime(250);
    const recording = await recorder.stopRecording();

    expect(chunks).toEqual([3200, 3200]);
    expect(files.get(recording.uri)?.byteLength).toBe(44 + 6400);
  });

  it("does not start when it was stopped while the clip loaded", async () => {
    vi.useFakeTimers();
    let deliver: (buffer: ArrayBuffer) => void = () => undefined;
    const recorder = createClipRecorder({ load: () => new Promise((resolve) => (deliver = resolve)) });
    const chunks: number[] = [];
    recorder.pcm.start((pcm) => chunks.push(pcm.byteLength));

    const starting = recorder.startRecording();
    await expect(recorder.stopRecording()).rejects.toThrow("Not recording");
    deliver(wavOf(tone(4000)));
    await starting;
    vi.advanceTimersByTime(1000);

    expect(chunks).toEqual([]);
    expect(recorder.isRecording).toBe(false);
  });
});

describe("createNativeRecorder", () => {
  it("streams the microphone to live transcription and the levels", async () => {
    const recorder = createNativeRecorder();
    const chunks: number[] = [];
    recorder.pcm.start((pcm) => chunks.push(pcm.byteLength));

    const starting = recorder.startRecording();
    await vi.waitFor(() => expect(audio.streams[0]?.started).toBe(true));
    audio.streams[0]?.resolveStart();
    await starting;
    audio.streams[0]?.emit(tone(3200));
    const levels = recorder.readLevels();
    const recording = await recorder.stopRecording();

    expect(chunks).toEqual([3200, 3200]);
    expect(levels?.length).toBe(7);
    expect(recording.mimeType).toBe("audio/wav");
    expect(audio.streams[0]?.stopped).toBe(true);
  });

  it("closes the microphone when it is stopped while it opens", async () => {
    const recorder = createNativeRecorder();

    const starting = recorder.startRecording();
    await vi.waitFor(() => expect(audio.streams[0]?.started).toBe(true));
    await recorder.stopRecording().catch(() => undefined);
    audio.streams[0]?.resolveStart();
    await starting;

    expect(audio.streams[0]?.stopped).toBe(true);
    expect(recorder.isRecording).toBe(false);
  });

  it("names a refused microphone the way the browser does", async () => {
    audio.granted = false;

    await expect(createNativeRecorder().startRecording()).rejects.toMatchObject({ name: "NotAllowedError" });
  });
});
