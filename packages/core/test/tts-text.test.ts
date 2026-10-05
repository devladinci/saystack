import { describe, expect, it } from "vitest";
import { needsRewrite, needsSummary, speechChunks, toReadingBlocks, toSpeechText } from "../src/tts/text.js";

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

  it("reads the text around code and tables it leaves out", () => {
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

  it("reads a link as its domain instead of dropping it", () => {
    expect(toSpeechText("See https://github.com/devladinci/saystack/issues/42 for details.")).toBe(
      "See github.com for details.",
    );
    expect(toSpeechText("Docs: https://www.example.com.")).toBe("Docs: example.com.");
    expect(toSpeechText("Вижте (https://example.bg/docs) за подробности.")).toBe("Вижте (example.bg) за подробности.");
  });

  it("strips HTML tags but keeps angle brackets that are not tags", () => {
    expect(toSpeechText("<b>Bold</b> and <a href='x'>a link</a><br/><!-- note -->")).toBe("Bold and a link.");
    expect(toSpeechText("The function returns Array<string> when x <y and y> z.")).toBe(
      "The function returns Array<string> when x <y and y> z.",
    );
  });

  it("keeps a year that starts a line, and still drops list numbers", () => {
    expect(toSpeechText("The timeline.\n2024. The first release.\n2025. The rewrite.")).toBe(
      "The timeline. 2024. The first release. 2025. The rewrite.",
    );
    expect(toSpeechText("1. Install it\n12) Run it")).toBe("Install it. Run it.");
  });

  it("drops emoji", () => {
    expect(toSpeechText("Shipped 🎉 and tested ✅, thumbs 👍🏽 up 🇧🇬")).toBe("Shipped and tested, thumbs up.");
    expect(toSpeechText("Warning ⚠️ ahead")).toBe("Warning ahead.");
  });

  it("keeps text with content when chunks are made", () => {
    const text =
      "First sentence is here for the test suite. Second sentence continues the flow of this text. Third sentence wraps up the demo nicely.";
    const chunks = speechChunks(text);

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join("")).toContain("First sentence");
  });
});
describe("needsRewrite", () => {
  it("asks for a rewrite when a voice cannot read the reply as written", () => {
    expect(needsRewrite("The meeting is at 3 pm on Friday.")).toBe(true);
    expect(needsRewrite("Цената е 25 лв.")).toBe(true);
    expect(needsRewrite("Email vlado@example.com about it.")).toBe(true);
    expect(needsRewrite("Pick one and/or the other.")).toBe(true);
    expect(needsRewrite("It returns x <y.")).toBe(true);
    expect(needsRewrite("Run this:\n```bash\npnpm test\n```")).toBe(true);
    expect(needsRewrite("| Plan | Seats |\n| --- | --- |\n| Pro | five |")).toBe(true);
  });

  it("leaves plain sentences to be read as written", () => {
    expect(needsRewrite("Sure. I'll read it to you, one word at a time!")).toBe(false);
    expect(needsRewrite("Здравей — как си?")).toBe(false);
    expect(needsRewrite("## Steps\n1. Install it\n2. Run it")).toBe(false);
    expect(needsRewrite("Check the [docs](https://example.com/docs) first.")).toBe(false);
    expect(needsRewrite("See https://example.com/docs for details.")).toBe(false);
    expect(needsRewrite("Done ✅")).toBe(false);
    expect(needsRewrite("A long plain answer. ".repeat(60))).toBe(false);
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
