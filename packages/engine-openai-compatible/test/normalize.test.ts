import { describe, expect, it } from "vitest";
import { buildNormalizeSystemPrompt, buildNormalizeUserPrompt } from "../src/normalizePrompt.js";
import { parseNormalized } from "../src/normalize.js";

describe("normalizePrompt", () => {
  it("names the allowed languages when given", () => {
    const prompt = buildNormalizeSystemPrompt(["bg", "en"]);

    expect(prompt).toContain("Allowed languages: bg, en");
  });

  it("falls back to auto-detect wording when the list is empty", () => {
    const prompt = buildNormalizeSystemPrompt([]);

    expect(prompt).toContain("the language of the input text");
  });

  it("demands JSON-only output", () => {
    const prompt = buildNormalizeSystemPrompt(["en"]);

    expect(prompt).toContain("ONLY a JSON object");
  });

  it("user prompt is the raw text", () => {
    expect(buildNormalizeUserPrompt("hi there")).toBe("hi there");
  });
});

describe("parseNormalized", () => {
  it("parses a clean JSON answer", () => {
    const parsed = parseNormalized('{"language":"bg","text":"четири процента"}');

    expect(parsed).toEqual({ language: "bg", text: "четири процента" });
  });

  it("strips markdown fences around the JSON", () => {
    const parsed = parseNormalized('```json\n{"language":"en","text":"four percent"}\n```');

    expect(parsed).toEqual({ language: "en", text: "four percent" });
  });

  it("recovers JSON wrapped in prose", () => {
    const parsed = parseNormalized('Here you go: {"language":"en","text":"four percent"} — done!');

    expect(parsed).toEqual({ language: "en", text: "four percent" });
  });

  it("rejects empty text and non-string fields", () => {
    expect(parseNormalized('{"language":"en","text":"  "}')).toBeNull();
    expect(parseNormalized('{"language":7,"text":"hi"}')).toBeNull();
    expect(parseNormalized("no json here")).toBeNull();
  });
});
const hasLiveLlm = process.env.OMLX_TOKEN !== undefined && process.env.OMLX_TOKEN.length > 0;

describe.skipIf(!hasLiveLlm)("live oMLX gemma-4 normalizer", () => {
  it("normalizes numbers, money and code blocks end to end", { timeout: 60_000 }, async () => {
    const { createLlmNormalizer } = await import("../src/normalize.js");
    const normalize = createLlmNormalizer({
      url: "http://127.0.0.1:7777/v1",
      ...(process.env.OMLX_TOKEN !== undefined ? { token: process.env.OMLX_TOKEN } : {}),
      model: "gemma-4-26B-A4B-it-QAT-MLX-4bit",
      timeoutSeconds: 45,
    });

    const result = await normalize(
      "Revenue grew 4.2% to $1,250,000 on 3/11/2026.\n\n```js\nlet x = 1;\n```\n\nCall +359888123456.",
      ["bg", "en"],
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(`${result.errorCode}: ${result.message}`);
    }

    expect(["bg", "en"]).toContain(result.language);
    expect(result.normalizedText).not.toContain("```");
    expect(result.normalizedText).not.toContain("+359888123456");
    expect(result.normalizedText.length).toBeGreaterThan(20);
  });
});
