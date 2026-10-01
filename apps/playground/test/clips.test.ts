import { existsSync } from "node:fs";

import { speechChunks, toSpeechText } from "@saystack/core";
import { describe, expect, it } from "vitest";

import manifest from "../src/clips.json";
import { DEMO_DICTATION, SPOKEN_REPLIES } from "../src/content.js";

const clipPath = (file: string): URL => new URL(`../public/clips/${file}`, import.meta.url);

describe("the recorded voice", () => {
  it("has a clip for every chunk the library will ask for", () => {
    const recorded = new Set(manifest.replies.map((clip) => clip.text));
    const asked = SPOKEN_REPLIES.flatMap((markdown) => speechChunks(toSpeechText(markdown)));

    expect(asked.filter((text) => !recorded.has(text))).toEqual([]);
  });

  it("has the demo dictation", () => {
    expect(manifest.dictation.text).toBe(DEMO_DICTATION);
  });

  it("ships every file it lists", () => {
    const files = [...manifest.replies, manifest.dictation].map((clip) => clip.file);

    expect(files.filter((file) => !existsSync(clipPath(file)))).toEqual([]);
  });
});
