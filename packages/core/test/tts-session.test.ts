import { describe, expect, it, vi } from "vitest";

import { createSpeechSession } from "../src/tts/session.js";
import type { ITtsDriver, ITtsSynthesizeResult, ISpeechClip } from "../src/tts/types.js";

interface ISynthCall {
  text: string;
  signal: AbortSignal | undefined;
}

interface IFakeDriver {
  driver: ITtsDriver;
  synthCalls: ISynthCall[];
  failSynthWith: (errorCode: ITtsSynthesizeResult & { ok: false }) => void;
  setPlayGate: (gate: Promise<void>) => void;
}

const makeWav = (seed: number): ArrayBuffer => new ArrayBuffer(seed + 8);

const makeClip = (gate: Promise<void>): ISpeechClip => {
  let releasePlay = (): void => undefined;

  return {
    play: () =>
      new Promise<void>((resolve) => {
        releasePlay = (): void => {
          resolve();
        };

        gate.then(
          () => releasePlay(),
          () => releasePlay(),
        );
      }),
    stop: () => {
      releasePlay();
    },
    release: () => undefined,
  };
};

let gateForNewClips: Promise<void> | null = null;

function makeDriver(): IFakeDriver {
  const synthCalls: ISynthCall[] = [];
  let failure: (ITtsSynthesizeResult & { ok: false }) | null = null;

  const driver: ITtsDriver = {
    synthesize: async (input) => {
      synthCalls.push({ text: input.text, signal: input.signal });
      if (failure) {
        return failure;
      }
      return { ok: true, audio: makeWav(input.text.length), mimeType: "audio/wav" };
    },
    createClip: async () => ({ ok: true, clip: makeClip(gateForNewClips ?? Promise.resolve()) }),
  };

  return {
    driver,
    synthCalls,
    failSynthWith: (errorCode) => {
      failure = errorCode;
    },
    setPlayGate: (gate) => {
      gateForNewClips = gate;
    },
  };
}


const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("createSpeechSession — happy path", () => {
  it("speaks markdown: chunks synthesized across fetches, ends done", async () => {
    const fake = makeDriver();
    const session = createSpeechSession(fake.driver);

    const outcome = await session.speak("First sentence here. ".repeat(10) + "Last.");

    expect(outcome.ok).toBe(true);
    expect(session.state.phase).toBe("done");
    expect(fake.synthCalls.length).toBeGreaterThan(1);
    expect(fake.synthCalls[0]?.text.length).toBeLessThanOrEqual(90);
  });

  it("prefetches chunk 2 while chunk 1 is queued", async () => {
    const fake = makeDriver();
    const gate = { release: (): void => undefined };
    fake.setPlayGate(new Promise<void>((resolve) => {
      gate.release = resolve;
    }));

    const session = createSpeechSession(fake.driver);
    const speaking = session.speak("Sentence one. Sentence two goes on a bit. Sentence three is here. A fourth sentence follows now. And a fifth closes it.");

    await settle();

    expect(fake.synthCalls.length).toBe(2);

    gate.release();
    await speaking;

    expect(fake.synthCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("empty markdown fails fast, no driver call", async () => {
    const fake = makeDriver();
    const session = createSpeechSession(fake.driver);

    const outcome = await session.speak("```\nonly code\n```");

    expect(outcome).toEqual({ ok: false, errorCode: "EMPTY_TEXT", message: expect.any(String) });
    expect(fake.synthCalls).toEqual([]);
  });
});

describe("createSpeechSession — coded failures", () => {
  it("engine failure surfaces its code", async () => {
    const fake = makeDriver();
    fake.failSynthWith({ ok: false, errorCode: "TTS_TIMEOUT", message: "engine timed out" });

    const session = createSpeechSession(fake.driver);
    const outcome = await session.speak("Words worth speaking.");

    expect(outcome).toEqual({ ok: false, errorCode: "TTS_TIMEOUT", message: "engine timed out" });
    expect(session.state.phase).toBe("error");
    expect(session.state.errorCode).toBe("TTS_TIMEOUT");
  });

  it("driver clip failure is coded, not thrown", async () => {
    const driver: ITtsDriver = {
      synthesize: async () => ({ ok: true, audio: makeWav(4), mimeType: "audio/wav" }),
      createClip: async () => ({ ok: false, errorCode: "TTS_UNSUPPORTED_MEDIA", message: "no decoder" }),
    };
    const session = createSpeechSession(driver);

    const outcome = await session.speak("Cannot be played.");

    expect(outcome).toEqual({ ok: false, errorCode: "TTS_UNSUPPORTED_MEDIA", message: "no decoder" });
    expect(session.state.phase).toBe("error");
  });
});

describe("createSpeechSession — stop and replay", () => {
  it("stop() mid-speech aborts the driver fetch and resets to idle", async () => {
    const fake = makeDriver();
    const gate = { release: (): void => undefined };
    fake.setPlayGate(new Promise<void>((resolve) => {
      gate.release = resolve;
    }));

    const session = createSpeechSession(fake.driver);
    const speaking = session.speak("Long answer sentence one. Sentence two follows.");

    await settle();

    expect(session.state.phase).toBe("playing");

    session.stop();
    await speaking;

    const signals = fake.synthCalls.map((call) => call.signal);
    expect(signals.some((s) => s?.aborted)).toBe(true);
    gate.release();
    expect(session.state.phase).toBe("idle");
  });

  it("second speak() cancels the first run", async () => {
    const fake = makeDriver();
    const gate = { release: (): void => undefined };
    fake.setPlayGate(new Promise<void>((resolve) => {
      gate.release = resolve;
    }));

    const session = createSpeechSession(fake.driver);
    const first = session.speak("First long speech. ".repeat(8));
    await settle();
    const second = session.speak("Second speech wins. ".repeat(12));
    gate.release();
    const secondOutcome = await second;
    await first;

    expect(secondOutcome.ok).toBe(true);
    expect(fake.synthCalls.some((call) => call.signal?.aborted)).toBe(true);
  });

  it("replay() plays the saved audio again without synthesizing", async () => {
    const fake = makeDriver();
    const createClip = vi.spyOn(fake.driver, "createClip");
    const session = createSpeechSession(fake.driver);

    await session.speak("Replay me later.");
    const callsAfterFirst = fake.synthCalls.length;

    session.replay();
    await settle();

    expect(fake.synthCalls.length).toBe(callsAfterFirst);
    expect(createClip).toHaveBeenCalledTimes(2);
    expect(session.state.phase).toBe("done");
  });

  it("replay with no speech is a no-op", () => {
    const fake = makeDriver();
    const session = createSpeechSession(fake.driver);

    expect(() => session.replay()).not.toThrow();
    expect(fake.synthCalls).toEqual([]);
  });
});

describe("createSpeechSession — subscription", () => {
  it("notifies on phase changes; unsubscribe silences", async () => {
    const fake = makeDriver();
    const session = createSpeechSession(fake.driver);
    const seenPhases: string[] = [];

    const unsubscribe = session.subscribe(() => {
      seenPhases.push(session.state.phase);
    });

    await session.speak("Short line.");
    unsubscribe();

    expect(seenPhases).toContain("loading");
    expect(seenPhases).toContain("playing");
    expect(seenPhases).toContain("done");

    vi.clearAllMocks();
  });
});