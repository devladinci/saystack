import { describe, expect, it, vi } from "vitest";

import { createSpeechSession } from "../src/tts/session.js";
import type { ISpeechEnvelope, ISpeechMark } from "../src/tts/timing.js";
import type {
  ISpeechClip,
  ISpeechClipResult,
  ITtsDriver,
  ITtsSynthesizeInput,
  ITtsSynthesizeResult,
} from "../src/tts/types.js";

interface IControlledClip {
  clip: ISpeechClip;
  finish: () => void;
  setTime: (seconds: number) => void;
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  seek: ReturnType<typeof vi.fn>;
}

function controlledClip(duration: number, envelope?: ISpeechEnvelope): IControlledClip {
  let end: () => void = () => undefined;
  let time = 0;
  const pause = vi.fn();
  const resume = vi.fn();
  const seek = vi.fn((seconds: number) => {
    time = seconds;
  });

  const clip: ISpeechClip = {
    play: () =>
      new Promise<void>((resolve) => {
        end = resolve;
      }),
    stop: () => end(),
    release: () => undefined,
    pause,
    resume,
    seek,
    duration,
    get currentTime() {
      return time;
    },
    ...(envelope === undefined ? {} : { envelope }),
  };

  return {
    clip,
    finish: () => end(),
    setTime: (seconds) => {
      time = seconds;
    },
    pause,
    resume,
    seek,
  };
}

interface IPlaybackDriver {
  driver: ITtsDriver;
  calls: string[];
  clips: IControlledClip[];
}

function playbackDriver(
  synthesize?: (input: ITtsSynthesizeInput) => Promise<ITtsSynthesizeResult>,
  envelope?: ISpeechEnvelope,
): IPlaybackDriver {
  const calls: string[] = [];
  const clips: IControlledClip[] = [];

  const driver: ITtsDriver = {
    synthesize: async (input) => {
      calls.push(input.text);

      return synthesize ? synthesize(input) : { ok: true, audio: new ArrayBuffer(8), mimeType: "audio/wav" };
    },
    createClip: async (): Promise<ISpeechClipResult> => {
      const made = controlledClip(2, envelope);
      clips.push(made);

      return { ok: true, clip: made.clip };
    },
  };

  return { driver, calls, clips };
}

const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const LONG_TEXT = [
  "The first sentence opens this reply and is long enough to fill a chunk.",
  "The second sentence carries on with a little more detail about the topic.",
  "The third sentence closes the thought and leaves room for one more.",
].join(" ");

describe("createSpeechSession — what gets spoken", () => {
  it("speaks the speech text, never the raw code or table markup", async () => {
    const fake = playbackDriver();
    const session = createSpeechSession(fake.driver);

    void session.speak("Intro line.\n```js\nsecret();\n```\n| a | b |\n|---|---|\nOutro line.");
    await settle();
    fake.clips[0]?.finish();
    await settle();

    const spoken = fake.calls.join(" ");

    expect(spoken).toContain("Intro line.");
    expect(spoken).toContain("Outro line.");
    expect(spoken).not.toContain("secret");
    expect(spoken).not.toContain("|");
  });

  it("speaks a rewrite when the session asks for one", async () => {
    const fake = playbackDriver();
    const rewrite = vi.fn(async () => "A short spoken version.");
    const session = createSpeechSession(fake.driver, { rewrite, shouldRewrite: () => true });

    void session.speak("Some long reply with a table.");
    await settle();

    expect(rewrite).toHaveBeenCalledWith("Some long reply with a table.", expect.any(AbortSignal));
    expect(fake.calls[0]).toBe("A short spoken version.");
  });

  it("falls back to the full text when the rewrite fails", async () => {
    const fake = playbackDriver();
    const session = createSpeechSession(fake.driver, {
      rewrite: async () => {
        throw new Error("model offline");
      },
      shouldRewrite: () => true,
    });

    void session.speak("Read me as I am.");
    await settle();

    expect(fake.calls[0]).toBe("Read me as I am.");
  });

  it("does not start speaking when stopped during the rewrite", async () => {
    const fake = playbackDriver();
    let finishRewrite: (text: string) => void = () => undefined;
    const session = createSpeechSession(fake.driver, {
      rewrite: () =>
        new Promise<string>((resolve) => {
          finishRewrite = resolve;
        }),
      shouldRewrite: () => true,
    });

    const speaking = session.speak("Stop me before I start.");
    session.stop();
    finishRewrite("Too late.");

    expect(await speaking).toEqual({ ok: true });
    await settle();
    expect(fake.calls).toEqual([]);
    expect(session.state.phase).toBe("idle");
  });
});

describe("createSpeechSession — playback", () => {
  it("plays the first chunk while the next one is still being synthesized", async () => {
    let calls = 0;
    const fake = playbackDriver(async () => {
      calls += 1;

      return calls === 1
        ? { ok: true, audio: new ArrayBuffer(8), mimeType: "audio/wav" }
        : new Promise<ITtsSynthesizeResult>(() => undefined);
    });
    const session = createSpeechSession(fake.driver);

    void session.speak(LONG_TEXT);
    await settle();

    expect(session.state.phase).toBe("playing");
    expect(session.state.chunkIndex).toBe(0);
    expect(fake.clips).toHaveLength(1);
    expect(fake.calls.length).toBe(2);
  });

  it("pauses and resumes through the clip", async () => {
    const fake = playbackDriver();
    const session = createSpeechSession(fake.driver);

    void session.speak("Pause me in the middle.");
    await settle();
    session.pause();

    expect(session.state.phase).toBe("paused");
    expect(fake.clips[0]?.pause).toHaveBeenCalledOnce();

    session.resume();

    expect(session.state.phase).toBe("playing");
    expect(fake.clips[0]?.resume).toHaveBeenCalledOnce();
  });

  it("seeks inside the playing chunk without restarting it", async () => {
    const fake = playbackDriver();
    const session = createSpeechSession(fake.driver);

    void session.speak("Jump ahead a little.");
    await settle();
    session.seek(0, 1.2);

    expect(fake.clips[0]?.seek).toHaveBeenCalledWith(1.2);
    expect(fake.clips).toHaveLength(1);
    expect(session.position().time).toBe(1.2);
  });

  it("seeks to another chunk from the saved audio", async () => {
    const fake = playbackDriver();
    const session = createSpeechSession(fake.driver);

    void session.speak(LONG_TEXT);
    await settle();
    fake.clips[0]?.finish();
    await settle();

    expect(session.state.chunkIndex).toBe(1);

    const synthesized = fake.calls.length;
    session.seek(0, 0.5);
    await settle();

    expect(session.state.chunkIndex).toBe(0);
    expect(fake.calls.length).toBe(synthesized);
    expect(fake.clips[2]?.seek).toHaveBeenCalledWith(0.5);
  });

  it("settles speak() only when the whole reply has been played", async () => {
    const fake = playbackDriver();
    const session = createSpeechSession(fake.driver);
    let isDone = false;

    void session.speak(LONG_TEXT).then(() => {
      isDone = true;
    });
    await settle();
    session.seek(1);
    await settle();

    expect(isDone).toBe(false);

    for (let guard = 0; guard < 5 && !isDone; guard += 1) {
      fake.clips[fake.clips.length - 1]?.finish();
      await settle();
    }

    expect(isDone).toBe(true);
    expect(session.state.phase).toBe("done");
  });

  it("reports a clip that cannot be decoded as a coded error", async () => {
    const driver: ITtsDriver = {
      synthesize: async () => ({ ok: true, audio: new ArrayBuffer(8), mimeType: "audio/wav" }),
      createClip: async () => {
        throw new Error("bad wav header");
      },
    };
    const session = createSpeechSession(driver);

    const outcome = await session.speak("Broken audio.");

    expect(outcome).toEqual({ ok: false, errorCode: "TTS_UNSUPPORTED_MEDIA", message: "bad wav header" });
    expect(session.state.phase).toBe("error");
    expect(session.state.errorMessage).toBe("bad wav header");
  });

  it("keeps the engine's reason until speech starts again", async () => {
    let calls = 0;
    const fake = playbackDriver(async () => {
      calls += 1;

      return calls === 1
        ? { ok: false, errorCode: "TTS_UNAVAILABLE", message: "the voice server is offline" }
        : { ok: true, audio: new ArrayBuffer(8), mimeType: "audio/wav" };
    });
    const session = createSpeechSession(fake.driver);

    await session.speak("Say this.");

    expect(session.state).toMatchObject({
      phase: "error",
      errorCode: "TTS_UNAVAILABLE",
      errorMessage: "the voice server is offline",
    });

    session.replay();
    await settle();

    expect(session.state).toMatchObject({ phase: "playing", errorCode: null, errorMessage: null });
  });
});

describe("createSpeechSession — word timings", () => {
  it("estimates word timings from the clip envelope", async () => {
    const envelope: ISpeechEnvelope = { duration: 2, speechStart: 0, speechEnd: 2, pauses: [] };
    const fake = playbackDriver(undefined, envelope);
    const session = createSpeechSession(fake.driver);

    void session.speak("One two three four.");
    await settle();

    const words = session.state.chunks[0]?.words ?? [];

    expect(words.map((word) => word.text)).toEqual(["One", "two", "three", "four."]);

    fake.clips[0]?.setTime(0.1);
    expect(session.position().wordIndex).toBe(0);

    fake.clips[0]?.setTime(1.6);
    expect(session.position().wordIndex).toBe(3);
  });

  it("uses the engine's word marks when it reports them", async () => {
    const marks: ISpeechMark[] = [
      { charIndex: 0, time: 0.1 },
      { charIndex: 6, time: 0.9 },
    ];
    const fake = playbackDriver(async () => ({ ok: true, audio: new ArrayBuffer(8), mimeType: "audio/wav", marks }));
    const session = createSpeechSession(fake.driver);

    void session.speak("Hello world.");
    await settle();

    const words = session.state.chunks[0]?.words ?? [];

    expect(words[0]?.start).toBe(0.1);
    expect(words[1]?.start).toBe(0.9);
    expect(words[1]?.end).toBe(2);
  });
});

describe("createSpeechSession — review regressions", () => {
  it("pauses in the gap between two chunks and starts the next one paused", async () => {
    let release: () => void = () => undefined;
    let calls = 0;
    const fake = playbackDriver(async () => {
      calls += 1;

      if (calls === 2) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }

      return { ok: true, audio: new ArrayBuffer(8), mimeType: "audio/wav" };
    });
    const session = createSpeechSession(fake.driver);

    void session.speak(LONG_TEXT);
    await settle();
    fake.clips[0]?.finish();
    await settle();
    session.pause();

    expect(session.state.phase).toBe("paused");

    release();
    await settle();

    expect(fake.clips[1]?.pause).toHaveBeenCalledOnce();
    expect(session.state.phase).toBe("paused");
    expect(session.state.chunkIndex).toBe(1);
  });

  it("tells subscribers when it seeks inside a paused chunk", async () => {
    const fake = playbackDriver();
    const session = createSpeechSession(fake.driver);
    const seen = vi.fn();

    void session.speak("Seek me while paused.");
    await settle();
    session.pause();
    session.subscribe(seen);
    session.seek(0, 1);

    expect(seen).toHaveBeenCalledOnce();
    expect(session.position().time).toBe(1);
  });

  it("starts the clip before announcing that it plays", async () => {
    const fake = playbackDriver();
    const session = createSpeechSession(fake.driver);

    session.subscribe(() => {
      if (session.state.phase === "playing") {
        session.stop();
      }
    });

    void session.speak("Stop me the moment I start.");
    await settle();

    expect(session.state.phase).toBe("idle");
    expect(fake.clips).toHaveLength(1);
  });

  it("does not reuse audio that was still being made when speech stopped", async () => {
    let calls = 0;
    const fake = playbackDriver(async (input) => {
      calls += 1;

      if (calls === 2) {
        await new Promise<void>((resolve) => {
          input.signal?.addEventListener("abort", () => resolve(), { once: true });
        });

        return { ok: false, errorCode: "TTS_FAILED", message: "cancelled by caller" };
      }

      return { ok: true, audio: new ArrayBuffer(8), mimeType: "audio/wav" };
    });
    const session = createSpeechSession(fake.driver);

    void session.speak(LONG_TEXT);
    await settle();
    session.stop();
    session.seek(1);
    await settle();

    expect(session.state.phase).toBe("playing");
    expect(session.state.chunkIndex).toBe(1);
  });

  it("moves on to the next chunk when asked to seek past the end of one", async () => {
    const fake = playbackDriver();
    const session = createSpeechSession(fake.driver);

    void session.speak(LONG_TEXT);
    await settle();
    session.seek(0, 5);
    await settle();

    expect(session.state.chunkIndex).toBe(1);
  });
});
