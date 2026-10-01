import type { IDictationInput } from "@saystack/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCaptionInput, DROP_MS } from "../src/Mobile/captionInput.js";
import { fitCaption } from "../src/Mobile/captionSteps.js";

describe("caption size", () => {
  it("keeps the largest size while the words fit in four lines", () => {
    expect(fitCaption(0, 4)).toEqual({ step: 0, isScrolling: false });
  });

  it("shrinks one step at a time, then scrolls once the smallest size is full", () => {
    expect(fitCaption(0, 5)).toEqual({ step: 1, isScrolling: false });
    expect(fitCaption(1, 7)).toEqual({ step: 2, isScrolling: false });
    expect(fitCaption(2, 9)).toEqual({ step: 2, isScrolling: true });
  });

  it("never grows back while the same dictation streams", () => {
    expect(fitCaption(2, 1)).toEqual({ step: 2, isScrolling: false });
  });
});

describe("live words on mobile", () => {
  const ended: (string | null)[] = [];
  const field: IDictationInput = { show: () => undefined, end: (text) => ended.push(text) };
  const captions: string[] = [];
  const drops: string[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    ended.length = 0;
    captions.length = 0;
    drops.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const input = (): IDictationInput =>
    createCaptionInput(field, { onCaption: (text) => captions.push(text), onDrop: (text) => drops.push(text) });

  it("show in the middle of the screen, not in the draft", () => {
    input().show("Could you read");

    expect(captions).toEqual(["Could you read"]);
    expect(ended).toEqual([]);
  });

  it("drop into the draft once the drop has played", () => {
    const words = input();
    words.end("Could you read it out loud?");

    expect(drops).toEqual(["Could you read it out loud?"]);
    expect(ended).toEqual([]);

    vi.advanceTimersByTime(DROP_MS);

    expect(ended).toEqual(["Could you read it out loud?"]);
    expect(captions.at(-1)).toBe("");
  });

  it("leave the draft alone when the dictation is cancelled", () => {
    const words = input();
    words.show("Could you");
    words.end(null);
    vi.advanceTimersByTime(DROP_MS);

    expect(ended).toEqual([]);
    expect(drops).toEqual([]);
    expect(captions.at(-1)).toBe("");
  });
});
