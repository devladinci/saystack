import { describe, expect, it } from "vitest";

import { estimateDurations } from "../src/player/estimateDurations.js";

describe("estimateDurations", () => {
  it("keeps the durations it already knows", () => {
    expect(estimateDurations([{ text: "Done.", words: [], duration: 1.2 }])).toEqual([1.2]);
  });

  it("is not thrown off by a one-word first part with a long lead-in", () => {
    const [, rest = 0] = estimateDurations([
      { text: "Hi.", words: [], duration: 2 },
      { text: "x".repeat(300), words: [], duration: 0 },
    ]);

    expect(rest).toBeGreaterThan(15);
    expect(rest).toBeLessThan(40);
  });
});
