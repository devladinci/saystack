import type { ISttRealtimeResult, ISttRealtimeSession, ISttTranscribeResult, SttErrorCode } from "@saystack/core";
import { createWSMessageEvent, WSContext } from "hono/ws";
import { describe, expect, it, vi } from "vitest";

import { createRealtimeBridge } from "../src/realtimeBridge.js";

interface IFakeSession {
  session: ISttRealtimeSession;
  audio: number[];
  delta: (text: string, full: string) => void;
  fail: (errorCode: SttErrorCode, message: string) => void;
  finish: (result: ISttTranscribeResult) => void;
  release: ReturnType<typeof vi.fn>;
}

function fakeSession(): IFakeSession {
  const audio: number[] = [];
  let handleDelta: (delta: string, full: string) => void = () => undefined;
  let handleError: (errorCode: SttErrorCode, message?: string) => void = () => undefined;
  let finish: (result: ISttTranscribeResult) => void = () => undefined;
  const release = vi.fn();

  const session: ISttRealtimeSession = {
    capabilities: { streaming: true, interimResults: true, wordTimings: false, languages: [] },
    feedPcm16: (pcm) => audio.push(pcm.byteLength),
    onDelta: (handler) => {
      handleDelta = handler;
    },
    onError: (handler) => {
      handleError = handler;
    },
    stop: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    release,
  };

  return {
    session,
    audio,
    delta: (text, full) => handleDelta(text, full),
    fail: (errorCode, message) => handleError(errorCode, message),
    finish: (result) => finish(result),
    release,
  };
}

function client() {
  const sent: Record<string, unknown>[] = [];
  const closed: number[] = [];
  const ws = new WSContext({
    send: (data) => sent.push(JSON.parse(String(data)) as Record<string, unknown>),
    close: (code) => closed.push(code ?? 1005),
    readyState: 1,
  });

  return { ws, sent, closed };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const text = (message: Record<string, unknown>) => createWSMessageEvent(JSON.stringify(message));

const pcm = (bytes: number) => createWSMessageEvent(new ArrayBuffer(bytes));

describe("createRealtimeBridge", () => {
  it("opens the engine on start and relays audio up and text down", async () => {
    const fake = fakeSession();
    const open = vi.fn(async (): Promise<ISttRealtimeResult> => ({ ok: true, session: fake.session }));
    const events = createRealtimeBridge(open);
    const { ws, sent, closed } = client();

    events.onMessage?.(pcm(320), ws);
    events.onMessage?.(text({ type: "start", language: "en" }), ws);
    await settle();
    events.onMessage?.(pcm(3200), ws);
    fake.delta(" Hello", " Hello");
    events.onMessage?.(text({ type: "stop" }), ws);
    fake.finish({ ok: true, text: " Hello there." });
    await settle();

    expect(open).toHaveBeenCalledWith({ language: "en" });
    expect(fake.audio).toEqual([3200]);
    expect(sent).toEqual([
      { type: "ready" },
      { type: "transcript.delta", delta: " Hello" },
      { type: "transcript.done", text: " Hello there." },
    ]);
    expect(closed).toEqual([1000]);
  });

  it("passes a refusal on with its code, so the client can transcribe afterwards", async () => {
    const events = createRealtimeBridge(async () => ({
      ok: false,
      errorCode: "MODEL_NOT_FOUND",
      message: "Model 'parakeet' does not support realtime transcription.",
    }));
    const { ws, sent, closed } = client();

    events.onMessage?.(text({ type: "start" }), ws);
    await settle();

    expect(sent).toEqual([
      {
        type: "error",
        errorCode: "MODEL_NOT_FOUND",
        detail: "Model 'parakeet' does not support realtime transcription.",
      },
    ]);
    expect(closed).toEqual([1011]);
  });

  it("reports an engine that fails mid-stream or on stop", async () => {
    const midStream = fakeSession();
    const first = client();
    const events = createRealtimeBridge(async () => ({ ok: true, session: midStream.session }));

    events.onMessage?.(text({ type: "start" }), first.ws);
    await settle();
    midStream.fail("ENGINE_UNAVAILABLE", "the engine went away");

    expect(first.sent.at(-1)).toEqual({
      type: "error",
      errorCode: "ENGINE_UNAVAILABLE",
      detail: "the engine went away",
    });
    expect(first.closed).toEqual([1011]);

    const onStop = fakeSession();
    const second = client();
    const next = createRealtimeBridge(async () => ({ ok: true, session: onStop.session }));

    next.onMessage?.(text({ type: "start" }), second.ws);
    await settle();
    next.onMessage?.(text({ type: "stop" }), second.ws);
    onStop.finish({ ok: false, errorCode: "TIMEOUT", message: "too slow" });
    await settle();

    expect(second.sent.at(-1)).toEqual({ type: "error", errorCode: "TIMEOUT", detail: "too slow" });
    expect(second.closed).toEqual([1011]);
  });

  it("stops a recording that runs past the byte limit", async () => {
    const fake = fakeSession();
    const events = createRealtimeBridge(async () => ({ ok: true, session: fake.session }), { maxBytes: 5000 });
    const { ws, sent, closed } = client();

    events.onMessage?.(text({ type: "start" }), ws);
    await settle();
    events.onMessage?.(pcm(3200), ws);
    events.onMessage?.(pcm(3200), ws);
    events.onMessage?.(pcm(3200), ws);

    expect(fake.audio).toEqual([3200]);
    expect(sent.at(-1)).toMatchObject({ type: "error", errorCode: "AUDIO_TOO_LARGE" });
    expect(closed).toEqual([1011]);
  });

  it("releases the engine when the client hangs up, even while it is still opening", async () => {
    const fake = fakeSession();
    let resolveOpen: (result: ISttRealtimeResult) => void = () => undefined;
    const events = createRealtimeBridge(
      () =>
        new Promise((resolve) => {
          resolveOpen = resolve;
        }),
    );
    const { ws, sent } = client();

    events.onMessage?.(text({ type: "start" }), ws);
    events.onClose?.(new Event("close") as CloseEvent, ws);
    resolveOpen({ ok: true, session: fake.session });
    await settle();

    expect(fake.release).toHaveBeenCalledOnce();
    expect(sent).toEqual([]);
  });
});

describe("createRealtimeBridge final pass", () => {
  it("replaces the stream's closing echo with one pass over the whole recording", async () => {
    const fake = fakeSession();
    const heard: Uint8Array[] = [];
    const finalize = vi.fn(async (wav: Uint8Array) => {
      heard.push(wav);
      return { ok: true as const, text: " Friday evening." };
    });
    const events = createRealtimeBridge(async () => ({ ok: true, session: fake.session }), { finalize });
    const { ws, sent, closed } = client();

    events.onMessage?.(text({ type: "start" }), ws);
    await settle();
    events.onMessage?.(pcm(3200), ws);
    events.onMessage?.(pcm(1600), ws);
    fake.delta(" Friday evening.", " Friday evening.");
    events.onMessage?.(text({ type: "stop" }), ws);
    fake.delta(" evening.", " Friday evening. evening.");
    fake.finish({ ok: true, text: " Friday evening. evening." });
    await settle();

    const wav = heard[0] ?? new Uint8Array();
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(new DataView(wav.buffer).getUint32(24, true)).toBe(16000);
    expect(wav.byteLength).toBe(44 + 4800);
    expect(sent).toEqual([
      { type: "ready" },
      { type: "transcript.delta", delta: " Friday evening." },
      { type: "transcript.done", text: " Friday evening." },
    ]);
    expect(closed).toEqual([1000]);
  });

  it("answers with the words streamed so far when the final pass fails", async () => {
    const fake = fakeSession();
    const events = createRealtimeBridge(async () => ({ ok: true, session: fake.session }), {
      finalize: async () => ({ ok: false, errorCode: "ENGINE_UNAVAILABLE", message: "busy" }),
    });
    const { ws, sent } = client();

    events.onMessage?.(text({ type: "start" }), ws);
    await settle();
    fake.delta(" Streamed", " Streamed");
    fake.delta(" so far.", " Streamed so far.");
    events.onMessage?.(text({ type: "stop" }), ws);
    await settle();

    expect(sent.at(-1)).toEqual({ type: "transcript.done", text: " Streamed so far." });
  });

  it("closes the stream as soon as the speaker stops, without asking it to flush", async () => {
    const fake = fakeSession();
    const stop = vi.spyOn(fake.session, "stop");
    let answer: (result: ISttTranscribeResult) => void = () => undefined;
    const events = createRealtimeBridge(async () => ({ ok: true, session: fake.session }), {
      finalize: () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    });
    const { ws, sent } = client();

    events.onMessage?.(text({ type: "start" }), ws);
    await settle();
    events.onMessage?.(text({ type: "stop" }), ws);
    await settle();

    expect(fake.release).toHaveBeenCalledOnce();
    expect(stop).not.toHaveBeenCalled();
    expect(sent).toEqual([{ type: "ready" }]);

    answer({ ok: true, text: "From the recording." });
    await settle();

    expect(sent.at(-1)).toEqual({ type: "transcript.done", text: "From the recording." });
  });
});

describe("createRealtimeBridge — the recording outlives the stream", () => {
  it("answers from the final pass when the stream fails to flush after the last word", async () => {
    const fake = fakeSession();
    const events = createRealtimeBridge(async () => ({ ok: true, session: fake.session }), {
      finalize: async () => ({ ok: true, text: "The whole recording." }),
    });
    const { ws, sent, closed } = client();

    events.onMessage?.(text({ type: "start" }), ws);
    await settle();
    events.onMessage?.(pcm(3200), ws);
    events.onMessage?.(text({ type: "stop" }), ws);
    fake.fail("TIMEOUT", "the transcript did not finish in time");
    fake.finish({ ok: false, errorCode: "TIMEOUT", message: "the transcript did not finish in time" });
    await settle();

    expect(sent).toEqual([{ type: "ready" }, { type: "transcript.done", text: "The whole recording." }]);
    expect(closed).toEqual([1000]);
  });

  it("does not wait for the stream's flush once the final pass has the text", async () => {
    const fake = fakeSession();
    const events = createRealtimeBridge(async () => ({ ok: true, session: fake.session }), {
      finalize: async () => ({ ok: true, text: "The whole recording." }),
    });
    const { ws, sent } = client();

    events.onMessage?.(text({ type: "start" }), ws);
    await settle();
    events.onMessage?.(text({ type: "stop" }), ws);
    await settle();

    expect(sent.at(-1)).toEqual({ type: "transcript.done", text: "The whole recording." });
  });

  it("keeps recording after the stream breaks mid-sentence, and answers from the final pass", async () => {
    const fake = fakeSession();
    const heard: Uint8Array[] = [];
    const events = createRealtimeBridge(async () => ({ ok: true, session: fake.session }), {
      finalize: async (wav) => {
        heard.push(wav);

        return { ok: true, text: "Everything that was said." };
      },
    });
    const { ws, sent, closed } = client();

    events.onMessage?.(text({ type: "start" }), ws);
    await settle();
    events.onMessage?.(pcm(3200), ws);
    fake.delta(" Everything", " Everything");
    fake.fail("ENGINE_UNAVAILABLE", "the engine dropped the stream");
    events.onMessage?.(pcm(3200), ws);
    events.onMessage?.(text({ type: "stop" }), ws);
    await settle();

    expect(sent).toEqual([
      { type: "ready" },
      { type: "transcript.delta", delta: " Everything" },
      { type: "transcript.done", text: "Everything that was said." },
    ]);
    expect(heard[0]?.byteLength).toBe(44 + 6400);
    expect(fake.audio).toEqual([3200]);
    expect(fake.release).toHaveBeenCalled();
    expect(closed).toEqual([1000]);
  });

  it("still fails when the stream breaks and there is no final pass to fall back on", async () => {
    const fake = fakeSession();
    const events = createRealtimeBridge(async () => ({ ok: true, session: fake.session }));
    const { ws, sent, closed } = client();

    events.onMessage?.(text({ type: "start" }), ws);
    await settle();
    fake.fail("ENGINE_UNAVAILABLE", "the engine dropped the stream");

    expect(sent.at(-1)).toMatchObject({ type: "error", errorCode: "ENGINE_UNAVAILABLE" });
    expect(closed).toEqual([1011]);
  });

  it("reports the final pass's failure when the stream is gone too", async () => {
    const fake = fakeSession();
    const events = createRealtimeBridge(async () => ({ ok: true, session: fake.session }), {
      finalize: async () => ({ ok: false, errorCode: "ENGINE_UNAVAILABLE", message: "busy" }),
    });
    const { ws, sent } = client();

    events.onMessage?.(text({ type: "start" }), ws);
    await settle();
    fake.fail("TIMEOUT", "stream lost");
    events.onMessage?.(text({ type: "stop" }), ws);
    await settle();

    expect(sent.at(-1)).toMatchObject({ type: "error", errorCode: "ENGINE_UNAVAILABLE", detail: "busy" });
  });
});

describe("createRealtimeBridge refine", () => {
  it("gives the final text and the start message's context to refine, and sends what it returns", async () => {
    const fake = fakeSession();
    const refine = vi.fn(async (heard: string) => heard.replace("peer", "PR").trim());
    const events = createRealtimeBridge(async () => ({ ok: true, session: fake.session }), { refine });
    const { ws, sent, closed } = client();

    events.onMessage?.(text({ type: "start", language: "en", context: "user: PR 42 is up" }), ws);
    await settle();
    events.onMessage?.(text({ type: "stop" }), ws);
    fake.finish({ ok: true, text: " review the peer" });
    await settle();

    expect(refine).toHaveBeenCalledWith(
      " review the peer",
      { language: "en", context: "user: PR 42 is up" },
      expect.any(AbortSignal),
    );
    expect(sent.at(-1)).toEqual({ type: "transcript.done", text: "review the PR" });
    expect(closed).toEqual([1000]);
  });

  it("refines the final pass's text, not the stream's", async () => {
    const fake = fakeSession();
    const refine = vi.fn(async (heard: string) => `${heard}!`);
    const events = createRealtimeBridge(async () => ({ ok: true, session: fake.session }), {
      finalize: async () => ({ ok: true, text: "One clean pass." }),
      refine,
    });
    const { ws, sent } = client();

    events.onMessage?.(text({ type: "start" }), ws);
    await settle();
    events.onMessage?.(text({ type: "stop" }), ws);
    fake.finish({ ok: true, text: " echoed echoed" });
    await settle();

    expect(refine).toHaveBeenCalledWith("One clean pass.", {}, expect.any(AbortSignal));
    expect(sent.at(-1)).toEqual({ type: "transcript.done", text: "One clean pass.!" });
  });

  it("sends the text as it was when refine throws", async () => {
    const fake = fakeSession();
    const events = createRealtimeBridge(async () => ({ ok: true, session: fake.session }), {
      refine: async () => {
        throw new Error("cleaner is down");
      },
    });
    const { ws, sent } = client();

    events.onMessage?.(text({ type: "start" }), ws);
    await settle();
    events.onMessage?.(text({ type: "stop" }), ws);
    fake.finish({ ok: true, text: "As heard." });
    await settle();

    expect(sent.at(-1)).toEqual({ type: "transcript.done", text: "As heard." });
  });

  it("aborts refine and sends nothing when the client leaves first", async () => {
    const fake = fakeSession();
    let signal: AbortSignal | undefined;
    let release: (value: string) => void = () => undefined;
    const events = createRealtimeBridge(async () => ({ ok: true, session: fake.session }), {
      refine: (_heard, _start, given) => {
        signal = given;

        return new Promise((resolve) => {
          release = resolve;
        });
      },
    });
    const { ws, sent } = client();

    events.onMessage?.(text({ type: "start" }), ws);
    await settle();
    events.onMessage?.(text({ type: "stop" }), ws);
    fake.finish({ ok: true, text: "As heard." });
    await settle();
    events.onClose?.(new Event("close") as CloseEvent, ws);
    release("Too late.");
    await settle();

    expect(signal?.aborted).toBe(true);
    expect(sent).toEqual([{ type: "ready" }]);
  });

  it("stops refine before the client stops waiting, and sends the text as it was", async () => {
    const fake = fakeSession();
    let signal: AbortSignal | undefined;
    const events = createRealtimeBridge(async () => ({ ok: true, session: fake.session }), {
      refine: (heard, _start, given) => {
        signal = given;

        return new Promise((resolve) => {
          given.addEventListener("abort", () => resolve(heard));
        });
      },
    });
    const { ws, sent } = client();

    events.onMessage?.(text({ type: "start" }), ws);
    await settle();
    events.onMessage?.(text({ type: "stop", waitMs: 1050 }), ws);
    fake.finish({ ok: true, text: "As heard." });
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(signal?.aborted).toBe(true);
    expect(sent.at(-1)).toEqual({ type: "transcript.done", text: "As heard." });
  });

  it("does not start refine when the client is about to stop waiting", async () => {
    const fake = fakeSession();
    const refine = vi.fn(async (heard: string) => `${heard}!`);
    const events = createRealtimeBridge(async () => ({ ok: true, session: fake.session }), { refine });
    const { ws, sent } = client();

    events.onMessage?.(text({ type: "start" }), ws);
    await settle();
    events.onMessage?.(text({ type: "stop", waitMs: 800 }), ws);
    fake.finish({ ok: true, text: "As heard." });
    await settle();

    expect(refine).not.toHaveBeenCalled();
    expect(sent.at(-1)).toEqual({ type: "transcript.done", text: "As heard." });
  });

  it("does not refine a failed transcription", async () => {
    const fake = fakeSession();
    const refine = vi.fn(async (heard: string) => heard);
    const events = createRealtimeBridge(async () => ({ ok: true, session: fake.session }), { refine });
    const { ws, sent } = client();

    events.onMessage?.(text({ type: "start" }), ws);
    await settle();
    events.onMessage?.(text({ type: "stop" }), ws);
    fake.finish({ ok: false, errorCode: "ENGINE_UNAVAILABLE", message: "busy" });
    await settle();

    expect(refine).not.toHaveBeenCalled();
    expect(sent.at(-1)).toMatchObject({ type: "error", errorCode: "ENGINE_UNAVAILABLE" });
  });
});
