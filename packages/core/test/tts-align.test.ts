import { describe, expect, it } from "vitest";

import { alignWords, wordKey } from "../src/tts/align.js";

const words = (text: string): string[] => text.split(/\s+/).filter(Boolean);

describe("wordKey", () => {
  it("ignores case, punctuation and accents", () => {
    expect(wordKey("Café,")).toBe("cafe");
    expect(wordKey("«Hello!»")).toBe("hello");
    expect(wordKey("—")).toBe("");
  });

  it("keeps letters of any script", () => {
    expect(wordKey("Здравей.")).toBe("здравеи");
  });
});

describe("alignWords", () => {
  it("matches the same words one to one", () => {
    expect(alignWords(words("One two three."), words("One two three"))).toEqual([0, 1, 2]);
  });

  it("follows speech that adds a full stop to a heading", () => {
    expect(alignWords(words("Title. Intro line."), words("Title Intro line."))).toEqual([0, 1, 2]);
  });

  it("skips page words the speech leaves out", () => {
    const page = words("Before the code x = 1 after the code");
    const spoken = words("Before the code after the code");

    expect(alignWords(spoken, page)).toEqual([0, 1, 2, 6, 7, 8]);
  });

  it("marks spoken words the page does not show", () => {
    const page = words("Look at this. Then carry on.");
    const spoken = words("Look at this. Code block, skipped. Then carry on.");

    expect(alignWords(spoken, page)).toEqual([0, 1, 2, -1, -1, -1, 3, 4, 5]);
  });

  it("recovers after a reworded stretch", () => {
    const page = words("It costs 1000000 dollars today");
    const spoken = words("It costs one million dollars today");

    expect(alignWords(spoken, page)).toEqual([0, 1, -1, -1, 3, 4]);
  });
});
