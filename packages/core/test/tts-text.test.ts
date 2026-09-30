import { describe, expect, it } from "vitest";
import { hasSpeechText, needsSummary, speechChunks, toReadingBlocks, toSpeechText } from "../src/tts/text.js";

describe("toSpeechText", () => {
  it("strips code blocks, tables, rules, markdown noise", () => {
    const markdown = [
      "# Title",
      "Intro line.",
      "```",
      "const x = 1;",
      "```",
      "| a | b |",
      "|---|---|",
      "| 1 | 2 |",
      "---",
      "Final line.",
    ].join("\n");

    const spoken = toSpeechText(markdown);

    expect(spoken).toBe("Title. Intro line. Final line.");
    expect(spoken).not.toContain("const");
  });

  it("marks the spot where code and tables were skipped", () => {
    const spoken = toSpeechText("Before.\n```js\nx();\n```\nMiddle.\n| a | b |\n|---|---|\nAfter.");

    expect(spoken).toContain("Before.");
    expect(spoken).toContain("Middle.");
    expect(spoken).toContain("After.");
    expect(spoken).not.toContain("x();");
    expect(spoken).not.toContain("| a |");
  });

  it("detects content that needs a summary", () => {
    expect(needsSummary("Short answer.")).toBe(false);
    expect(needsSummary("Word. ".repeat(600))).toBe(true);
    expect(needsSummary("Text with ```code``` inside.")).toBe(true);
  });

  it("keeps text with content when chunks are made", () => {
    const text = "First sentence is here for the test suite. Second sentence continues the flow of this text. Third sentence wraps up the demo nicely.";
    const chunks = speechChunks(text);

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join("")).toContain("First sentence");
  });
});
describe("toReadingBlocks", () => {
  it("keeps paragraphs, headings and list items apart and drops what is not read", () => {
    const markdown = [
      "## Saturday",
      "Leave around **nine**, so you reach",
      "the [trailhead](https://example.com) early.",
      "",
      "- Pack a jacket",
      "- Charge the phone",
      "",
      "```js",
      "const hike = true;",
      "```",
      "| a | b |",
      "Done.",
    ].join("\n");

    expect(toReadingBlocks(markdown)).toEqual([
      "Saturday",
      "Leave around nine, so you reach the trailhead early.",
      "Pack a jacket",
      "Charge the phone",
      "Done.",
    ]);
  });

  it("shows the same words the speech reads", () => {
    const markdown = "Hello *there*\n\n1. First step";
    const read = toReadingBlocks(markdown).join(" ").split(" ");
    const spoken = toSpeechText(markdown).split(" ");

    expect(read.map((word) => word.replace(/\W/g, ""))).toEqual(spoken.map((word) => word.replace(/\W/g, "")));
  });
});
