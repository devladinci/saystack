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

  it("finds its place again after a table read as sentences, however long they run", () => {
    const page = words(
      "The glow follows the voice. Long replies with tables are rewritten for speech, so the table is described.",
    );
    const spoken = words(
      "The glow follows the voice. Part Aura shows the voice as light. Part Player pauses, skips and replays. Long replies with tables are rewritten for speech, so the table is described.",
    );
    const matches = alignWords(spoken, page);

    expect(matches.slice(0, 5)).toEqual([0, 1, 2, 3, 4]);
    expect(matches.slice(5, 18)).toEqual(Array.from({ length: 13 }, () => -1));
    expect(matches.slice(18)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });

  it("finds its place again after a long stretch of the page that the speech leaves out", () => {
    const skipped = "one two three four five six seven eight nine ten eleven twelve";
    const page = words(`Run this command ${skipped} and then restart the server`);
    const spoken = words("Run this command and then restart the server");

    expect(alignWords(spoken, page)).toEqual([0, 1, 2, 15, 16, 17, 18, 19]);
  });

  it("gives a word said twice to the place it was said first", () => {
    const page = words("the voice and the light");
    const spoken = words("the voice shows the voice and the light");

    expect(alignWords(spoken, page)).toEqual([0, 1, -1, -1, -1, 2, 3, 4]);
  });

  it("still follows a text too long to compare in full", () => {
    const long = Array.from({ length: 3000 }, (_, index) => `word${index}`);
    const matches = alignWords(long, long);

    expect(matches[0]).toBe(0);
    expect(matches[2999]).toBe(2999);
  });

  it("recovers after a reworded stretch", () => {
    const page = words("It costs 1000000 dollars today");
    const spoken = words("It costs one million dollars today");

    expect(alignWords(spoken, page)).toEqual([0, 1, -1, -1, 3, 4]);
  });
});
