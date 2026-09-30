import { describe, expect, it } from "vitest";

import { estimateWordTimings, speechEnvelope, wordAt, wordTimingsFromMarks } from "../src/tts/timing.js";
import type { ISpeechEnvelope } from "../src/tts/timing.js";

const RATE = 22050;

function clip(parts: readonly (readonly ["tone" | "quiet", number])[]): Float32Array {
  const total = parts.reduce((sum, [, seconds]) => sum + Math.round(seconds * RATE), 0);
  const samples = new Float32Array(total);
  let offset = 0;

  for (const [kind, seconds] of parts) {
    const count = Math.round(seconds * RATE);

    if (kind === "tone") {
      for (let index = 0; index < count; index += 1) {
        samples[offset + index] = 0.4 * Math.sin((2 * Math.PI * 220 * index) / RATE);
      }
    }
    offset += count;
  }

  return samples;
}

describe("speechEnvelope", () => {
  it("finds where speech starts and ends, and the pause between phrases", () => {
    const envelope = speechEnvelope(
      clip([
        ["quiet", 0.2],
        ["tone", 0.5],
        ["quiet", 0.3],
        ["tone", 0.4],
        ["quiet", 0.1],
      ]),
      RATE,
    );

    expect(envelope.duration).toBeCloseTo(1.5, 2);
    expect(envelope.speechStart).toBeCloseTo(0.2, 1);
    expect(envelope.speechEnd).toBeCloseTo(1.4, 1);
    expect(envelope.pauses).toHaveLength(1);
    expect(envelope.pauses[0]?.start).toBeCloseTo(0.7, 1);
    expect(envelope.pauses[0]?.end).toBeCloseTo(1.0, 1);
  });

  it("ignores gaps too short to be a pause", () => {
    const envelope = speechEnvelope(
      clip([
        ["tone", 0.3],
        ["quiet", 0.05],
        ["tone", 0.3],
      ]),
      RATE,
    );

    expect(envelope.pauses).toEqual([]);
  });

  it("treats silence as a whole clip with no speech bounds", () => {
    const envelope = speechEnvelope(new Float32Array(RATE), RATE);

    expect(envelope).toEqual({ duration: 1, speechStart: 0, speechEnd: 1, pauses: [] });
  });
});

describe("estimateWordTimings", () => {
  const envelope: ISpeechEnvelope = {
    duration: 2.2,
    speechStart: 0.1,
    speechEnd: 2.1,
    pauses: [{ start: 0.9, end: 1.3 }],
  };

  it("spans the voiced part of the clip", () => {
    const words = estimateWordTimings("Hello there. General Kenobi.", envelope);

    expect(words[0]?.start).toBeCloseTo(0.1, 5);
    expect(words[words.length - 1]?.end).toBeCloseTo(2.1, 5);
  });

  it("pins the sentence gap to the pause heard in the audio", () => {
    const words = estimateWordTimings("Hello there. General Kenobi.", envelope);

    expect(words[1]?.text).toBe("there.");
    expect(words[1]?.end).toBeCloseTo(0.9, 5);
    expect(words[2]?.start).toBeCloseTo(1.3, 5);
  });

  it("keeps the character offsets of each word", () => {
    const words = estimateWordTimings("Hi  there", { duration: 1, speechStart: 0, speechEnd: 1, pauses: [] });

    expect(words.map((word) => [word.charStart, word.charEnd])).toEqual([
      [0, 2],
      [4, 9],
    ]);
  });

  it("returns nothing for empty text", () => {
    expect(estimateWordTimings("   ", envelope)).toEqual([]);
  });
});

describe("wordTimingsFromMarks", () => {
  it("fills words the engine did not mark", () => {
    const words = wordTimingsFromMarks(
      "one two three",
      [
        { charIndex: 0, time: 0 },
        { charIndex: 8, time: 1 },
      ],
      1.5,
    );

    expect(words.map((word) => word.start)).toEqual([0, 0.5, 1]);
    expect(words[2]?.end).toBe(1.5);
  });
});

describe("wordAt", () => {
  const words = estimateWordTimings("a b c", { duration: 3, speechStart: 0, speechEnd: 3, pauses: [] });

  it("finds the word under the time", () => {
    expect(wordAt(words, 0)).toBe(0);
    expect(wordAt(words, 1.5)).toBe(1);
    expect(wordAt(words, 2.9)).toBe(2);
  });

  it("is -1 before the first word", () => {
    expect(wordAt(estimateWordTimings("a", { duration: 1, speechStart: 0.5, speechEnd: 1, pauses: [] }), 0.2)).toBe(-1);
  });
});
