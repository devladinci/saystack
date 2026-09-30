import type { ITtsSynthesizeResult } from "@saystack/core";
import { act, renderHook } from "@testing-library/react";
import { deferred } from "./deferred.js";
import { makeDriver, type IClipFn, type ISynthFn } from "./mocks.js";
import { useSpeech } from "../src/useSpeech.js";
import { describe, expect, it, vi } from "vitest";

const WAV = new ArrayBuffer(8);

const okClip: IClipFn = async () => ({
  ok: true,
  clip: { play: async () => undefined, stop: () => undefined, release: () => undefined },
});

describe("useSpeech", () => {
  it("keeps one api for its session even when the driver is recreated on every render", () => {
    const { result, rerender } = renderHook(() => useSpeech(makeDriver()));
    const first = result.current[1];

    rerender();
    rerender();

    expect(result.current[1]).toBe(first);
  });

  it("reads the latest rewrite when speech starts", async () => {
    const early = vi.fn(async () => "early");
    const late = vi.fn(async () => "Late rewrite wins.");
    const { result, rerender } = renderHook(({ rewrite }) => useSpeech(makeDriver(), { rewrite, shouldRewrite: () => true }), {
      initialProps: { rewrite: early },
    });

    rerender({ rewrite: late });

    await act(async () => {
      await result.current[1].speak("Anything.");
    });

    expect(early).not.toHaveBeenCalled();
    expect(late).toHaveBeenCalledOnce();
  });

  it("starts idle and keeps state identity stable across unrelated re-renders", () => {
    const { result, rerender } = renderHook(() => useSpeech(makeDriver()));

    expect(result.current[0].phase).toBe("idle");

    const before = result.current[0];
    rerender();

    expect(result.current[0]).toBe(before);
  });

  it("speak plays the chunk and ends in done", async () => {
    const play = deferred<void>();
    const hangingClip: IClipFn = async () => ({
      ok: true,
      clip: { play: () => play.promise, stop: () => undefined, release: () => undefined },
    });
    const { result } = renderHook(() => useSpeech(makeDriver({ createClip: hangingClip })));

    let speakPromise: Promise<void> | null = null;
    await act(async () => {
      speakPromise = result.current[1].speak("One chunk only.");
      await Promise.resolve();
    });

    expect(result.current[0].phase).toBe("playing");

    await act(async () => {
      play.resolve();
      await speakPromise;
    });

    expect(result.current[0].phase).toBe("done");
  });

  it("stop resets to idle", async () => {
    const play = deferred<void>();
    const hangingClip: IClipFn = async () => ({
      ok: true,
      clip: { play: () => play.promise, stop: () => undefined, release: () => undefined },
    });
    const { result } = renderHook(() => useSpeech(makeDriver({ createClip: hangingClip })));

    await act(async () => {
      const speakPromise = result.current[1].speak("Speak until stopped.");
      result.current[1].stop();

      await speakPromise;
    });

    expect(result.current[0].phase).toBe("idle");
  });

  it("unmount stops the clip", async () => {
    const stop = vi.fn();
    const neverEndingClip: IClipFn = async () => ({
      ok: true,
      clip: { play: () => new Promise<void>(() => undefined), stop, release: () => undefined },
    });
    const { result, unmount } = renderHook(() => useSpeech(makeDriver({ createClip: neverEndingClip })));

    await act(async () => {
      void result.current[1].speak("Speak until unmounted.");
      await Promise.resolve();
    });
    unmount();

    expect(stop).toHaveBeenCalled();
  });

  it("surfaces a failed synthesize as coded error state", async () => {
    const failing: ISynthFn = async () => ({
      ok: false,
      errorCode: "TTS_RETRYABLE",
      message: "engine said 503",
    });
    const { result } = renderHook(() => useSpeech(makeDriver({ synthesize: failing })));

    await act(async () => {
      await result.current[1].speak("Fails at the engine.");
    });

    expect(result.current[0]).toMatchObject({ phase: "error", errorCode: "TTS_RETRYABLE" });
  });

  it("speak passes the reference pair through when both parts are given", async () => {
    const seen: ITtsSynthesizeResult[] = [];
    const synth: ISynthFn = async (input) => {
      seen.push({ ok: true, audio: WAV, mimeType: "audio/wav" });

      expect(input.refAudio).toBe("refwave");
      expect(input.refText).toBe("reference text");

      return seen[seen.length - 1] as ITtsSynthesizeResult;
    };
    const { result } = renderHook(() => useSpeech(makeDriver({ synthesize: synth })));

    await act(async () => {
      await result.current[1].speak("Cloned voice please.", "refwave", "reference text");
    });

    expect(seen.length).toBe(1);
  });
});
