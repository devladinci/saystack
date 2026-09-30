import type { ISpeechChunk } from "@saystack/core";
import { describe, expect, it } from "vitest";

import { auraReach, topEdgeClip, topEdgeOutline } from "../src/aura/auraGeometry.js";
import { CAPTION_STEPS, fitCaption, visibleCaptionLines } from "../src/captions/captionSteps.js";
import { holdOutcome, isPastCancel } from "../src/dictation/holdOutcome.js";
import { liftCard } from "../src/readAloud/cardLayout.js";
import { mapReadAlong, pageWordAt, readingText, seekFor } from "../src/readAloud/readAlongMap.js";

const chunk = (text: string, starts: number[] = []): ISpeechChunk => ({
  text,
  duration: starts.length > 0 ? (starts.at(-1) ?? 0) + 0.3 : 0,
  words: starts.map((start, index) => ({
    text: text.split(" ")[index] ?? "",
    charStart: 0,
    charEnd: 0,
    start,
    end: start + 0.3,
  })),
});

describe("fitCaption", () => {
  it("shrinks twice, then scrolls", () => {
    expect(fitCaption(0, 3)).toEqual({ step: 0, isScrolling: false });
    expect(fitCaption(0, 5)).toEqual({ step: 1, isScrolling: false });
    expect(fitCaption(1, 7)).toEqual({ step: 2, isScrolling: false });
    expect(fitCaption(2, 8)).toEqual({ step: 2, isScrolling: false });
    expect(fitCaption(2, 9)).toEqual({ step: 2, isScrolling: true });
  });

  it("never grows back within a dictation", () => {
    expect(fitCaption(2, 1)).toEqual({ step: 2, isScrolling: false });
    expect(CAPTION_STEPS.map((step) => step.fontSize)).toEqual([26, 21, 18]);
  });

  it("keeps the newest lines when it scrolls", () => {
    const lines = Array.from({ length: 11 }, (_, index) => `line ${index}`);

    expect(visibleCaptionLines(lines, 2)).toEqual(lines.slice(3));
    expect(visibleCaptionLines(lines.slice(0, 3), 2)).toEqual(lines.slice(0, 3));
  });
});

describe("liftCard", () => {
  const bounds = { minTop: 100, maxBottom: 600, padding: 12 };

  it("lifts in place when the reply already fits", () => {
    expect(liftCard({ ...bounds, top: 200, height: 150 })).toEqual({ dy: 0, maxBodyHeight: null });
  });

  it("moves up just enough to clear the player, or down to clear the header", () => {
    expect(liftCard({ ...bounds, top: 500, height: 150 })).toEqual({ dy: -50, maxBodyHeight: null });
    expect(liftCard({ ...bounds, top: 60, height: 150 })).toEqual({ dy: 40, maxBodyHeight: null });
  });

  it("scrolls a reply taller than the room, from the top of the room", () => {
    expect(liftCard({ ...bounds, top: 300, height: 900 })).toEqual({ dy: -200, maxBodyHeight: 476 });
  });
});

describe("read-along map", () => {
  const text = readingText("Leave at **nine**.\n\n- Pack a jacket\n\n```\ncode\n```");
  const chunks = [chunk("Leave at nine.", [0, 0.4, 0.7]), chunk("Pack a jacket.")];
  const map = mapReadAlong(chunks, text.words);

  it("splits the reply into blocks of words, without the code", () => {
    expect(text.blocks.map((block) => block.map((word) => word.text))).toEqual([
      ["Leave", "at", "nine."],
      ["Pack", "a", "jacket"],
    ]);
    expect(text.words.map((word) => word.index)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("finds the page word for a spoken one, across parts", () => {
    expect(pageWordAt(map, { chunkIndex: 0, wordIndex: 2, time: 0.8, duration: 1 })).toBe(2);
    expect(pageWordAt(map, { chunkIndex: 1, wordIndex: 2, time: 0, duration: 0 })).toBe(5);
    expect(pageWordAt(map, { chunkIndex: 0, wordIndex: -1, time: 0, duration: 1 })).toBe(-1);
  });

  it("keeps the last shown word while the speech says something the page does not", () => {
    const summary = mapReadAlong([chunk("Leave at nine sharp.")], text.words);

    expect(pageWordAt(summary, { chunkIndex: 0, wordIndex: 3, time: 0, duration: 0 })).toBe(2);
  });

  it("seeks to a tapped word, at its time when the part is known", () => {
    expect(seekFor(map, chunks, 1)).toEqual({ chunkIndex: 0, seconds: 0.4 });
    expect(seekFor(map, chunks, 4)).toEqual({ chunkIndex: 1, seconds: 0 });
    expect(seekFor(map, chunks, 99)).toBeNull();
  });
});

describe("aura geometry", () => {
  it("hangs from the top edge only", () => {
    expect(topEdgeOutline(402)).toMatchObject({ x: -80, y: 0, w: 562, isInner: true });
    expect(topEdgeClip(402, 120)).toEqual([0, -40, 402, 320]);
  });

  it("reaches as far as the look draws", () => {
    expect(auraReach({}, "dark", 0)).toBe(Math.ceil(1.8 + 43 * 1.3 + 12 * 4 + 2));
    expect(auraReach({ dark: { blur: 6 } }, "dark", 0)).toBe(Math.ceil(1.8 + 43 * 1.3 + 12 * 4 + 2 + 18));
  });
});

describe("hold to talk", () => {
  it("tells a hold from a tap and a slide away", () => {
    expect(holdOutcome({ heldMs: 1200, isCancelling: false, minHoldMs: 450 })).toBe("end");
    expect(holdOutcome({ heldMs: 200, isCancelling: false, minHoldMs: 450 })).toBe("tooShort");
    expect(holdOutcome({ heldMs: 1200, isCancelling: true, minHoldMs: 450 })).toBe("cancel");
    expect(isPastCancel(60, 50, 72)).toBe(true);
    expect(isPastCancel(30, 20, 72)).toBe(false);
  });
});
