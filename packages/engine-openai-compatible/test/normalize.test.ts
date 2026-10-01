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

  it("leaves the JSON shape to the response schema instead of the prose", () => {
    const prompt = buildNormalizeSystemPrompt(["en"]);

    expect(prompt).not.toContain("JSON");
  });

  it("user prompt is the raw text", () => {
    expect(buildNormalizeUserPrompt("hi there")).toBe("hi there");
  });
});

describe("createLlmNormalizer", () => {
  const reply = (content: string) => ({ complete: async () => ({ ok: true as const, content }) });

  it("asks the engine for a json_schema constrained to the allowed languages", async () => {
    const seen: unknown[] = [];
    const chatClient = {
      complete: async (request: { jsonSchema?: unknown }) => {
        seen.push(request.jsonSchema);
        return { ok: true as const, content: '{"language":"bg","text":"да"}' };
      },
    };
    const { createLlmNormalizer } = await import("../src/normalize.js");
    const normalize = createLlmNormalizer({ url: "http://engine/v1", model: "m", chatClient });

    await normalize("здравей", ["bg", "en"]);

    expect(seen[0]).toEqual({
      name: "speech",
      schema: {
        type: "object",
        properties: { language: { type: "string", enum: ["bg", "en"] }, text: { type: "string" } },
        required: ["language", "text"],
        additionalProperties: false,
      },
    });
  });

  it("leaves the language free when no languages are configured", async () => {
    const seen: unknown[] = [];
    const chatClient = {
      complete: async (request: { jsonSchema?: unknown }) => {
        seen.push(request.jsonSchema);
        return { ok: true as const, content: '{"language":"bg","text":"да"}' };
      },
    };
    const { createLlmNormalizer } = await import("../src/normalize.js");
    const normalize = createLlmNormalizer({ url: "http://engine/v1", model: "m", chatClient });

    await normalize("здравей", []);

    expect(seen[0]).toEqual({
      name: "speech",
      schema: {
        type: "object",
        properties: { language: { type: "string" }, text: { type: "string" } },
        required: ["language", "text"],
        additionalProperties: false,
      },
    });
  });

  it("still accepts a fenced reply from an engine that ignores the schema", async () => {
    const { createLlmNormalizer } = await import("../src/normalize.js");
    const normalize = createLlmNormalizer({
      url: "http://engine/v1",
      model: "m",
      chatClient: reply('```json\n{"language":"en","text":"hello there"}\n```'),
    });

    const result = await normalize("hi", ["en"]);

    expect(result).toEqual({ ok: true, normalizedText: "hello there", language: "en", usedFallbackStructure: false });
  });

  it("reports a coded failure when the engine returns prose", async () => {
    const { createLlmNormalizer } = await import("../src/normalize.js");
    const normalize = createLlmNormalizer({ url: "http://engine/v1", model: "m", chatClient: reply("sorry, no idea") });

    const result = await normalize("hi", ["en"]);

    expect(result).toEqual({
      ok: false,
      errorCode: "NORMALIZE_BAD_RESPONSE",
      message: "engine did not return the expected JSON object",
    });
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
const { LLM_URL = "", LLM_TOKEN = "", LLM_MODEL = "" } = process.env;

const hasLiveLlm = [LLM_URL, LLM_TOKEN, LLM_MODEL].every((value) => value.length > 0);

describe.skipIf(!hasLiveLlm)("live LLM normalizer", () => {
  it("normalizes numbers, money and code blocks end to end", { timeout: 60_000 }, async () => {
    const { createLlmNormalizer } = await import("../src/normalize.js");
    const normalize = createLlmNormalizer({
      url: LLM_URL,
      token: LLM_TOKEN,
      model: LLM_MODEL,
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
