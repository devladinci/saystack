import { describe, expect, it } from "vitest";

import { createSpeechSession } from "../src/tts/session.js";
import type { IStyleMap } from "../src/tts/style.js";
import type { ISpeechClip, ISpeechClipResult, ITtsDriver, ITtsSynthesizeInput } from "../src/index.js";

const FIELD_MAP: IStyleMap = {
  channel: { mode: "field", field: "instructions" },
  rules: [{ value: "amusement", label: "amused" }],
};

const TAG_MAP: IStyleMap = {
  channel: { mode: "tag", template: "<|emotion:{style}|>" },
  rules: [{ value: "amusement", label: "amused" }],
};

const LONG = "A long original reply that the rewrite replaces. ".repeat(20);

function makeDriver(marksFor?: (text: string) => readonly { charIndex: number; time: number }[]): {
  driver: ITtsDriver;
  seen: ITtsSynthesizeInput[];
} {
  const seen: ITtsSynthesizeInput[] = [];

  const clip: ISpeechClip = {
    play: async () => undefined,
    stop: () => undefined,
    release: () => undefined,
    duration: 1,
  };

  const driver: ITtsDriver = {
    synthesize: async (input) => {
      seen.push(input);
      const marks = marksFor?.(input.text);

      return {
        ok: true,
        audio: new ArrayBuffer(8),
        mimeType: "audio/wav",
        ...(marks === undefined ? {} : { marks }),
      };
    },
    createClip: async (): Promise<ISpeechClipResult> => ({ ok: true, clip }),
  };

  return { driver, seen };
}

describe("speech session — the style a rewrite chose", () => {
  it("a declared field channel carries the mapped value on every chunk", async () => {
    const { driver, seen } = makeDriver();
    const session = createSpeechSession(driver, {
      shouldRewrite: () => true,
      styleMap: FIELD_MAP,
      rewrite: async () => ({ text: "First line here. Second line here.", style: "amused" }),
    });

    await session.speak(LONG);

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((input) => input.fields?.instructions === "amusement")).toBe(true);
  });

  it("a declared tag channel pastes the tag into the text instead", async () => {
    const { driver, seen } = makeDriver();
    const session = createSpeechSession(driver, {
      shouldRewrite: () => true,
      styleMap: TAG_MAP,
      rewrite: async () => ({ text: "First line here. Second line here.", style: "amused" }),
    });

    await session.speak(LONG);

    expect(seen[0]?.text.startsWith("<|emotion:amusement|>")).toBe(true);
    expect(seen[0]?.fields).toBeUndefined();
  });

  it("a style nobody declared is dropped, not forwarded", async () => {
    const { driver, seen } = makeDriver();
    const session = createSpeechSession(driver, {
      shouldRewrite: () => true,
      styleMap: FIELD_MAP,
      rewrite: async () => ({ text: "First line here. Second line here.", style: "sexy" }),
    });

    await session.speak(LONG);

    expect(seen.every((input) => input.fields === undefined)).toBe(true);
  });

  it("with no map at all the rewrite's style never reaches the engine", async () => {
    const { driver, seen } = makeDriver();
    const session = createSpeechSession(driver, {
      shouldRewrite: () => true,
      rewrite: async () => ({ text: "First line here. Second line here.", style: "amused" }),
    });

    await session.speak(LONG);

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((input) => input.fields === undefined)).toBe(true);
  });

  it("a rewrite that returns plain text behaves exactly as before", async () => {
    const { driver, seen } = makeDriver();
    const session = createSpeechSession(driver, {
      shouldRewrite: () => true,
      rewrite: async () => "First line here. Second line here.",
    });

    await session.speak(LONG);

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((input) => input.fields === undefined)).toBe(true);
  });

  it("a rewrite that returns nothing keeps the markdown", async () => {
    const { driver, seen } = makeDriver();
    let calls = 0;
    const session = createSpeechSession(driver, {
      shouldRewrite: () => true,
      rewrite: async () => {
        calls += 1;
        return null;
      },
    });

    const outcome = await session.speak("Keep me exactly as I am.");

    expect(calls).toBe(1);
    expect(outcome).toEqual({ ok: true });
    expect(session.state.chunks[0]?.text).toContain("Keep me exactly as I am.");
    expect(seen.every((input) => input.text.includes("Keep me exactly as I am."))).toBe(true);
  });
});

describe("speech session — the style map is read when speech starts", () => {
  it("picks up a map that appears after the session was created", async () => {
    const { driver, seen } = makeDriver();
    const later = { map: undefined as IStyleMap | undefined };
    const session = createSpeechSession(driver, {
      shouldRewrite: () => true,
      get styleMap() {
        return later.map;
      },
      rewrite: async () => ({ text: "First line here. Second line here.", style: "amused" }),
    });

    later.map = FIELD_MAP;
    await session.speak(LONG);

    expect(seen.every((input) => input.fields?.instructions === "amusement")).toBe(true);
  });
});

describe("speech session — a rewrite that answers with a shape nobody promised", () => {
  const cases: readonly { name: string; value: unknown }[] = [
    { name: "no text at all", value: { style: "amused" } },
    { name: "a text that is not a string", value: { text: 7 } },
    { name: "undefined", value: undefined },
    { name: "a number", value: 42 },
  ];

  for (const { name, value } of cases) {
    it(`${name} falls back to the markdown instead of hanging`, async () => {
      const { driver, seen } = makeDriver();
      const session = createSpeechSession(driver, {
        styleMap: FIELD_MAP,
        shouldRewrite: () => true,
        rewrite: async () => value as never,
      });

      const outcome = await session.speak("Read me as written.");

      expect(outcome).toEqual({ ok: true });
      expect(session.state.phase).toBe("done");
      expect(seen.every((input) => input.text.includes("Read me as written."))).toBe(true);
    });
  }

  it("a null style — a nullable field in a model's JSON — is dropped, and the text is still used", async () => {
    const { driver, seen } = makeDriver();
    const session = createSpeechSession(driver, {
      styleMap: FIELD_MAP,
      shouldRewrite: () => true,
      rewrite: async () => ({ text: "First line here.", style: null }),
    });

    // The bug this guards: the null matched against the map used to throw out of the try, leaving the
    // session in "loading" and the reply unspoken.
    expect(await session.speak("Read me as written.")).toEqual({ ok: true });
    expect(seen.every((input) => input.fields === undefined)).toBe(true);
    expect(seen.every((input) => input.text.includes("First line here."))).toBe(true);
  });

  it("a throw from the rewrite still reads the markdown", async () => {
    const { driver, seen } = makeDriver();
    const session = createSpeechSession(driver, {
      styleMap: FIELD_MAP,
      shouldRewrite: () => true,
      rewrite: async () => {
        throw new Error("model died");
      },
    });

    expect(await session.speak("Read me as written.")).toEqual({ ok: true });
    expect(seen.every((input) => input.text.includes("Read me as written."))).toBe(true);
  });
});

describe("speech session — word timings under a tag channel", () => {
  it("marks counted against the tagged text are shifted back onto the spoken words", async () => {
    // The engine sees the tag, so it counts from the front of the tagged string.
    const { driver } = makeDriver((text) => {
      const prefix = text.indexOf("First");

      return [
        { charIndex: prefix, time: 0 },
        { charIndex: text.indexOf("line"), time: 1 },
      ];
    });
    const session = createSpeechSession(driver, {
      shouldRewrite: () => true,
      styleMap: TAG_MAP,
      rewrite: async () => ({ text: "First line here.", style: "amused" }),
    });

    await session.speak(LONG);

    const first = session.state.chunks[0];
    expect(first?.text.startsWith("<|emotion")).toBe(false);
    expect(first?.words[0]?.start).toBe(0);
    expect(first?.words[1]?.start).toBe(1);
  });
});

describe("speech session — the style channel and its rules come from one map", () => {
  it("a map swapped during the rewrite does not pair a new value with the old channel", async () => {
    const { driver, seen } = makeDriver();
    const later = { map: FIELD_MAP as IStyleMap };
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const session = createSpeechSession(driver, {
      shouldRewrite: () => true,
      get styleMap() {
        return later.map;
      },
      rewrite: async () => {
        await gate;
        // The app switches engine mid-rewrite: the map is now the tag one.
        later.map = TAG_MAP;
        return { text: "First line here. Second line here.", style: "amused" };
      },
    });

    const speaking = session.speak(LONG);
    release();
    await speaking;

    // The run started under the field map, so the value travels as the field, not as a tag.
    expect(seen.every((input) => input.fields?.instructions === "amusement")).toBe(true);
    expect(seen.every((input) => !input.text.startsWith("<|emotion"))).toBe(true);
  });
});

describe("speech session — a chunk stays inside the operator's character limit", () => {
  it("leaves room for the tag the channel adds, so short chunks are not refused", async () => {
    const { driver, seen } = makeDriver();
    const session = createSpeechSession(driver, {
      shouldRewrite: () => true,
      styleMap: TAG_MAP,
      rewrite: async () => ({ text: LONG, style: "amused" }),
    });

    await session.speak(LONG);

    const longest = seen.reduce((max, input) => Math.max(max, input.text.length), 0);

    expect(longest).toBeLessThanOrEqual(300);
    expect(seen.length).toBeGreaterThan(0);
  });
});
