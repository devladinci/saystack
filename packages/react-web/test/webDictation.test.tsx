import type { IPlatformRecorder } from "@saystack/core";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const web = vi.hoisted(() => ({
  stream: { id: "mic" } as unknown as MediaStream,
  started: [] as {
    url: string;
    stream: () => MediaStream | null;
    params?: Record<string, unknown>;
    finishTimeoutMs?: number;
  }[],
  finishWith: null as string | null,
}));

vi.mock("@saystack/web", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sharedAudioContext: () => ({}) as AudioContext,
  createWebRecorder: (): IPlatformRecorder => ({
    get stream() {
      return web.stream;
    },
    startRecording: async () => undefined,
    stopRecording: async () => ({ blob: new Blob(["x"], { type: "audio/webm" }) }),
  }),
  startRealtimeTranscription: (options: {
    url: string;
    stream: () => MediaStream | null;
    onText: (text: string) => void;
  }) => {
    web.started.push(options);
    options.onText("Hello");

    return { isLive: true, finish: async () => web.finishWith, cancel: () => undefined };
  },
}));

const { useWebDictation } = await import("../src/useWebDictation.js");

beforeEach(() => {
  web.started = [];
  web.finishWith = "Hello there.";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useWebDictation", () => {
  it("streams to the realtime url it reads at press time, from the recorder's microphone", async () => {
    let token = "first";
    const shown: string[] = [];
    const ended: (string | null)[] = [];
    const { result } = renderHook(() =>
      useWebDictation({
        endpoint: "/stt",
        realtime: { url: () => `ws://daemon/stt/stream?token=${token}` },
        input: { show: (text) => shown.push(text), end: (text) => ended.push(text) },
      }),
    );

    token = "second";
    act(() => {
      result.current.handlePressStart();
    });
    await act(async () => {
      result.current.handlePressEnd();
    });

    expect(web.started[0]?.url).toBe("ws://daemon/stt/stream?token=second");
    expect(web.started[0]?.stream()).toBe(web.stream);
    expect(shown).toEqual(["Hello"]);
    expect(ended).toEqual(["Hello there."]);
  });

  it("opens the stream with the conversation's context beside the app's own params", async () => {
    const { result, rerender } = renderHook(
      ({ context }: { context?: string }) =>
        useWebDictation({
          endpoint: "/stt",
          realtime: { url: "ws://daemon/stt/stream", params: { model: "m" }, finishTimeoutMs: 20_000 },
          ...(context === undefined ? {} : { context }),
        }),
      { initialProps: { context: "user: I opened PR 42" } as { context?: string } },
    );

    act(() => {
      result.current.handlePressStart();
    });
    await act(async () => {
      result.current.handlePressEnd();
    });
    rerender({});
    act(() => {
      result.current.handlePressStart();
    });
    await act(async () => {
      result.current.handlePressEnd();
    });

    expect(web.started[0]?.params).toEqual({ model: "m", context: "user: I opened PR 42" });
    expect(web.started[0]?.finishTimeoutMs).toBe(20_000);
    expect(web.started[1]?.params).toEqual({ model: "m" });
  });

  it("only transcribes the recording when no realtime endpoint is given", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ text: "Batch text." }));
    const onText = vi.fn();
    const { result } = renderHook(() => useWebDictation({ endpoint: "/stt", onText }));

    act(() => {
      result.current.handlePressStart();
    });
    await act(async () => {
      result.current.handlePressEnd();
    });

    expect(web.started).toEqual([]);
    expect(onText).toHaveBeenCalledWith("Batch text.");
  });

  it("uses the recorder and live transcription it is given instead of the microphone and the socket", async () => {
    const started: string[] = [];
    const recorder: IPlatformRecorder = {
      stream: null,
      startRecording: async () => {
        started.push("clip");
      },
      stopRecording: async () => ({ blob: new Blob(["clip"], { type: "audio/wav" }) }),
    };
    const shown: string[] = [];
    const ended: (string | null)[] = [];
    const { result } = renderHook(() =>
      useWebDictation({
        recorder,
        live: (_active, onText) => {
          onText("From the clip");

          return { isLive: true, finish: async () => "From the clip.", cancel: () => undefined };
        },
        realtime: { url: "ws://unused" },
        input: { show: (text) => shown.push(text), end: (text) => ended.push(text) },
      }),
    );

    act(() => {
      result.current.handlePressStart();
    });
    await act(async () => {
      result.current.handlePressEnd();
    });

    expect(started).toEqual(["clip"]);
    expect(web.started).toEqual([]);
    expect(shown).toEqual(["From the clip"]);
    expect(ended).toEqual(["From the clip."]);
  });
});
