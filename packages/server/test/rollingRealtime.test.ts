import type { ISttAdapter, ISttRealtimeSession, ISttTranscribeInput, ISttTranscribeResult } from "@saystack/core";
import { describe, expect, it, vi } from "vitest";

import type { IRollingRealtimeOptions } from "../src/rollingRealtime.js";
import { createRollingRealtimeSttAdapter } from "../src/rollingRealtime.js";

// 16 kHz mono PCM16 is 32 bytes a millisecond, and a WAV header is 44 bytes.
const MS = 32;
const HEADER = 44;

const FAILED: ISttTranscribeResult = { ok: false, errorCode: "ENGINE_UNAVAILABLE", message: "engine unreachable" };

const voice = (ms: number): Uint8Array => {
  const pcm = new Uint8Array(ms * MS);

  new Int16Array(pcm.buffer).fill(8000);

  return pcm;
};

const quiet = (ms: number): Uint8Array => new Uint8Array(ms * MS);

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// An engine that answers each pass with the next line of the script, and with the last line once it runs out.
function fakeStt(script: readonly (string | ISttTranscribeResult)[]) {
  const passes: ISttTranscribeInput[] = [];
  const stt: ISttAdapter = {
    capabilities: { streaming: false, interimResults: false, wordTimings: false, languages: ["en"] },
    transcribe: (input) => {
      const line = script[Math.min(passes.length, script.length - 1)] ?? "";

      passes.push(input);

      return Promise.resolve(typeof line === "string" ? { ok: true, text: line } : line);
    },
  };

  return { stt, passes, heardMs: () => passes.map((pass) => (pass.audio.byteLength - HEADER) / MS) };
}

async function openSession(stt: ISttAdapter, options?: IRollingRealtimeOptions, language?: string) {
  const opened = await createRollingRealtimeSttAdapter(stt, options).openRealtime(
    language === undefined ? {} : { language },
  );

  if (!opened.ok) {
    throw new Error("the rolling adapter always opens");
  }

  const deltas: string[] = [];
  const errors: string[] = [];
  let full = "";

  opened.session.onDelta((delta, fullText) => {
    deltas.push(delta);
    full = fullText;
  });
  opened.session.onError((errorCode) => errors.push(errorCode));

  return { session: opened.session, deltas, errors, full: () => full };
}

const say = async (session: ISttRealtimeSession, ...chunks: Uint8Array[]): Promise<void> => {
  for (const chunk of chunks) {
    session.feedPcm16(chunk);
    await settle();
  }
};

describe("createRollingRealtimeSttAdapter", () => {
  it("streams, whatever the file engine says of itself", () => {
    const adapter = createRollingRealtimeSttAdapter(fakeStt([""]).stt);

    expect(adapter.capabilities).toEqual({
      streaming: true,
      interimResults: true,
      wordTimings: false,
      languages: ["en"],
    });
  });

  it("sends a word once two passes in a row agree on it", async () => {
    const fake = fakeStt(["hello", "hello there", "hello there friend"]);
    const { session, deltas, full } = await openSession(fake.stt);

    await say(session, voice(500));
    expect(deltas).toEqual([]);

    await say(session, voice(500), voice(500));

    expect(deltas).toEqual(["hello", " there"]);
    expect(full()).toBe("hello there");
    expect(fake.heardMs()).toEqual([500, 1000, 1500]);
  });

  it("waits for a full step of new audio before the next pass", async () => {
    const fake = fakeStt(["hello"]);
    const { session } = await openSession(fake.stt, { stepMs: 400 });

    await say(session, voice(100), voice(100), voice(100));
    expect(fake.passes).toHaveLength(0);

    await say(session, voice(100));
    expect(fake.passes).toHaveLength(1);
  });

  it("tells words apart by what they say, and writes them the way the newer pass does", async () => {
    const fake = fakeStt(["Hello.", "hello, there", "Hello, there."]);
    const { session, deltas } = await openSession(fake.stt);

    await say(session, voice(500), voice(500));

    expect(deltas).toEqual(["hello,"]);
  });

  it("passes the language and a WAV file on", async () => {
    const fake = fakeStt(["здравей"]);
    const { session } = await openSession(fake.stt, undefined, "bg");

    await say(session, voice(500));

    expect(fake.passes[0]).toMatchObject({ language: "bg", mimeType: "audio/wav", filename: "audio.wav" });
    expect(new TextDecoder().decode(fake.passes[0]?.audio.subarray(0, 4))).toBe("RIFF");
  });

  it("runs no pass over silence", async () => {
    const fake = fakeStt(["you"]);
    const { session, deltas } = await openSession(fake.stt);

    await say(session, quiet(500), quiet(500), quiet(500), quiet(500));

    expect(fake.passes).toHaveLength(0);
    expect(deltas).toEqual([]);
  });

  it("hears a pause out for the last words, then leaves the engine alone", async () => {
    const fake = fakeStt(["one two"]);
    const { session, deltas } = await openSession(fake.stt);

    await say(session, voice(500), quiet(500));
    expect(deltas).toEqual(["one two"]);

    await say(session, quiet(500), quiet(500), quiet(500));
    expect(fake.passes).toHaveLength(2);
  });

  it("starts over after a pause, keeping only its last moment", async () => {
    const fake = fakeStt(["one two", "one two", "three", "three four"]);
    const { session, deltas, full } = await openSession(fake.stt);

    const pause = Array.from({ length: 10 }, () => quiet(100));

    await say(session, voice(500), ...pause, voice(500), voice(500));

    expect(fake.heardMs()).toEqual([500, 1000, 800, 1300]);
    expect(deltas).toEqual(["one two", " three"]);
    expect(full()).toBe("one two three");
  });

  it("closes a window that outgrows the limit, with every word it holds", async () => {
    const fake = fakeStt(["one", "one two", "one two three", "one two three four", "five", "five six"]);
    const { session, deltas } = await openSession(fake.stt, { maxWindowMs: 2000 });

    await say(session, voice(500), voice(500), voice(500), voice(500), voice(500), voice(500));

    expect(deltas).toEqual(["one", " two", " three four", " five"]);
    expect(fake.heardMs()).toEqual([500, 1000, 1500, 2000, 500, 1000]);
  });

  it("does not repeat a word when a pass adds one to the part already sent", async () => {
    const fake = fakeStt(["a b c", "a b c d", "a x b c d e", "a x b c d e f"]);
    const { session, full } = await openSession(fake.stt);

    await say(session, voice(500), voice(500), voice(500), voice(500));

    expect(full()).toBe("a b c d e");
  });

  it("does not skip a word when a pass drops one from the part already sent", async () => {
    const fake = fakeStt(["a b c", "a b c d", "b c d e", "b c d e f"]);
    const { session, full } = await openSession(fake.stt);

    await say(session, voice(500), voice(500), voice(500), voice(500));

    expect(full()).toBe("a b c d e");
  });

  it("finds its place again when a pass breaks the words it sent differently", async () => {
    const fake = fakeStt([
      "nowhere nowhere",
      "nowhere nowhere",
      "now here now here fast",
      "now here now here fast car",
    ]);
    const { session, deltas } = await openSession(fake.stt);

    await say(session, voice(500), voice(500), voice(500), voice(500));

    expect(deltas).toEqual(["nowhere nowhere", " fast"]);
  });

  it("rides out a failed pass", async () => {
    const fake = fakeStt(["hello", FAILED, "hello there", "hello there"]);
    const { session, deltas, errors } = await openSession(fake.stt);

    await say(session, voice(500), voice(500), quiet(500), quiet(500));

    expect(deltas).toEqual(["hello", " there"]);
    expect(errors).toEqual([]);
  });

  it("gives up after three failed passes in a row", async () => {
    const fake = fakeStt([FAILED]);
    const { session, errors } = await openSession(fake.stt);

    await say(session, voice(500), voice(500), voice(500), voice(500), voice(500));

    expect(errors).toEqual(["ENGINE_UNAVAILABLE"]);
    expect(fake.passes).toHaveLength(3);
    await expect(session.stop()).resolves.toMatchObject({ ok: false });
  });

  it("does not count a clip too short to transcribe as a failure", async () => {
    const short: ISttTranscribeResult = { ok: false, errorCode: "RECORDING_TOO_SHORT" };
    const fake = fakeStt([short, short, short, short, "hello", "hello"]);
    const { session, deltas, errors } = await openSession(fake.stt);

    await say(session, voice(500), voice(500), voice(500), voice(500), voice(500), voice(500));

    expect(errors).toEqual([]);
    expect(deltas).toEqual(["hello"]);
  });

  it("answers stop with everything heard, also the words no second pass confirmed", async () => {
    const fake = fakeStt(["hello", "hello there", "hello there friend"]);
    const { session, deltas } = await openSession(fake.stt);

    await say(session, voice(500), voice(500), voice(200));

    await expect(session.stop()).resolves.toEqual({ ok: true, text: "hello there friend" });
    expect(deltas).toEqual(["hello", " there friend"]);
    expect(fake.heardMs()).toEqual([500, 1000, 1200]);
  });

  it("answers stop without a pass when there is nothing new to hear", async () => {
    const fake = fakeStt(["hello"]);
    const { session } = await openSession(fake.stt);

    await say(session, voice(500), quiet(500), quiet(500));

    await expect(session.stop()).resolves.toEqual({ ok: true, text: "hello" });
    expect(fake.passes).toHaveLength(2);
  });

  it("answers stop with the engine's error when the last pass fails", async () => {
    const fake = fakeStt(["hello", FAILED]);
    const { session } = await openSession(fake.stt);

    await say(session, voice(500));

    await expect(session.stop()).resolves.toEqual(FAILED);
  });

  it("waits for the pass in flight before the last one", async () => {
    let answer: (result: ISttTranscribeResult) => void = () => undefined;
    const transcribe = vi
      .fn<ISttAdapter["transcribe"]>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      )
      .mockResolvedValue({ ok: true, text: "hello there" });
    const { session } = await openSession({ capabilities: fakeStt([""]).stt.capabilities, transcribe });

    session.feedPcm16(voice(500));
    const stopped = session.stop();

    await settle();
    expect(transcribe).toHaveBeenCalledTimes(1);

    answer({ ok: true, text: "hello" });

    await expect(stopped).resolves.toEqual({ ok: true, text: "hello there" });
    expect(transcribe).toHaveBeenCalledTimes(2);
  });

  it("says nothing more when released while the last pass is in flight", async () => {
    let answer: (result: ISttTranscribeResult) => void = () => undefined;
    const transcribe = vi
      .fn<ISttAdapter["transcribe"]>()
      .mockResolvedValueOnce({ ok: true, text: "hello" })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      );
    const { session, deltas } = await openSession({ capabilities: fakeStt([""]).stt.capabilities, transcribe });

    await say(session, voice(500));
    const stopped = session.stop();

    await settle();
    session.release();
    answer({ ok: true, text: "hello there" });

    await expect(stopped).resolves.toMatchObject({ ok: false });
    expect(deltas).toEqual([]);
  });

  it("cancels the pass in flight when released, and says nothing after", async () => {
    let answer: (result: ISttTranscribeResult) => void = () => undefined;
    let signal: AbortSignal | undefined;
    const stt: ISttAdapter = {
      capabilities: fakeStt([""]).stt.capabilities,
      transcribe: (input) => {
        signal = input.signal;

        return new Promise((resolve) => {
          answer = resolve;
        });
      },
    };
    const { session, deltas } = await openSession(stt);

    session.feedPcm16(voice(500));
    session.release();

    expect(signal?.aborted).toBe(true);

    answer({ ok: true, text: "hello" });
    await say(session, voice(500), voice(500));

    expect(deltas).toEqual([]);
    await expect(session.stop()).resolves.toMatchObject({ ok: false });
  });
});
