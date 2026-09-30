import type { IPlatformRecorder } from "@saystack/core";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const web = vi.hoisted(() => ({
  stream: { id: "mic" } as unknown as MediaStream,
  started: [] as { url: string; stream: () => MediaStream | null }[],
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
  startRealtimeTranscription: (options: { url: string; stream: () => MediaStream | null; onText: (text: string) => void }) => {
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
});
