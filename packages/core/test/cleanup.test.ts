import { describe, expect, it } from "vitest";

import { conversationContext, needsCleanup } from "../src/cleanup.js";

describe("needsCleanup", () => {
  it("leaves a short, punctuated transcript alone", () => {
    expect(needsCleanup("Sounds good, thanks.")).toBe(false);
    expect(needsCleanup("Can you summarise the last three messages and send them to Maria?")).toBe(false);
    expect(needsCleanup("Не, остави го както е.")).toBe(false);
  });

  it("has nothing to do for a word or for nothing", () => {
    expect(needsCleanup("Yes.")).toBe(false);
    expect(needsCleanup("   ")).toBe(false);
  });

  it("sees filler sounds, in several languages", () => {
    expect(needsCleanup("So, um, I think we should ship it.")).toBe(true);
    expect(needsCleanup("Is it uh ready yet?")).toBe(true);
    expect(needsCleanup("Also, ähm, das Meeting ist morgen.")).toBe(true);
    expect(needsCleanup("Ами, ъъъ, не знам.")).toBe(true);
    expect(needsCleanup("Euh, je ne sais pas.")).toBe(true);
  });

  it("does not take a word for a filler", () => {
    expect(needsCleanup("Er ist nicht hier.")).toBe(false);
    expect(needsCleanup("The umbrella is in the hall.")).toBe(false);
    expect(needsCleanup("Emma and Hermann are here.")).toBe(false);
  });

  it("sees a word said twice", () => {
    expect(needsCleanup("Ship it on on Friday.")).toBe(true);
    expect(needsCleanup("The the client wants it.")).toBe(true);
  });

  it("sees a transcript with no capitals or no sentence ends", () => {
    expect(needsCleanup("what's the capital of france")).toBe(true);
    expect(needsCleanup("So basically what I want is when the user stops talking the text gets cleaned up")).toBe(true);
  });

  it("does not ask for capitals from a script that has none", () => {
    expect(needsCleanup("好的，谢谢。")).toBe(false);
  });

  it("takes a long dictation as worth a look", () => {
    expect(needsCleanup(`${"This sentence is fine. ".repeat(8)}`)).toBe(true);
  });
});

describe("conversationContext", () => {
  const turns = [
    { role: "user", text: "I just opened PR 42." },
    { role: "assistant", text: "Great.\n\nI can   review it." },
    { role: "user", text: "Wait for CI." },
  ];

  it("writes one line a turn, oldest first", () => {
    expect(conversationContext(turns)).toBe(
      "user: I just opened PR 42.\nassistant: Great. I can review it.\nuser: Wait for CI.",
    );
  });

  it("keeps the newest turns when the budget runs out", () => {
    expect(conversationContext(turns, { maxChars: 60 })).toBe("assistant: Great. I can review it.\nuser: Wait for CI.");
  });

  it("cuts a long turn short and skips an empty one", () => {
    expect(
      conversationContext(
        [
          { role: "assistant", text: "a".repeat(30) },
          { role: "user", text: " " },
        ],
        { maxTurnChars: 10 },
      ),
    ).toBe(`assistant: ${"a".repeat(10)}…`);
  });

  it("is empty for an empty conversation", () => {
    expect(conversationContext([])).toBe("");
  });
});
