import { describe, expect, it } from "vitest";

import type { ILlmChatRequest } from "../src/llmTypes.js";
import { createLlmNormalizer, parseNormalized } from "../src/normalize.js";
import { buildNormalizeSystemPrompt, buildNormalizeUserPrompt } from "../src/normalizePrompt.js";

const answer = (content: string) => ({ complete: async () => ({ ok: true as const, content }) });

const recording = (content: string) => {
  const seen: ILlmChatRequest[] = [];

  return {
    seen,
    chatClient: {
      complete: async (request: ILlmChatRequest) => {
        seen.push(request);

        return { ok: true as const, content };
      },
    },
  };
};

const rewriteTo = (text: string) =>
  createLlmNormalizer({
    url: "http://engine/v1",
    model: "m",
    chatClient: answer(JSON.stringify({ text, language: "xx" })),
  });

describe("normalizePrompt", () => {
  it("asks for the rewrite in the message's own language, never translated", () => {
    const prompt = buildNormalizeSystemPrompt(["en"]);

    expect(prompt).toContain("same language as the message");
    expect(prompt).toContain("Never translate");
  });

  it("asks to keep numbers in digits", () => {
    expect(buildNormalizeSystemPrompt([])).toContain("Keep every number in digits");
  });

  it("names the configured languages as a hint, not as a target", () => {
    expect(buildNormalizeSystemPrompt(["bg", "en"])).toContain("usually in one of these languages: bg, en");
    expect(buildNormalizeSystemPrompt([])).not.toContain("usually in one of");
  });

  it("user prompt is the raw text", () => {
    expect(buildNormalizeUserPrompt("hi there")).toBe("hi there");
  });
});

describe("createLlmNormalizer — the request", () => {
  it("states the answer's JSON shape, so a server that ignores response_format still gets JSON", async () => {
    const { seen, chatClient } = recording('{"text":"да","language":"bg"}');
    const normalize = createLlmNormalizer({ url: "http://engine/v1", model: "m", chatClient });

    await normalize("да", ["bg", "en"]);

    expect(seen[0]?.system).toContain('Answer with only a JSON object: {"text": "<the rewrite>", "language":');
    expect(seen[0]?.jsonSchema).toEqual({
      name: "speech",
      schema: {
        type: "object",
        properties: { text: { type: "string" }, language: { type: "string" } },
        required: ["text", "language"],
        additionalProperties: false,
      },
    });
  });

  it("lets the model name a language the app did not list, instead of translating into one it did", async () => {
    const { seen, chatClient } = recording('{"text":"Der Preis ist 5 Euro.","language":"de"}');
    const normalize = createLlmNormalizer({ url: "http://engine/v1", model: "m", chatClient });

    const result = await normalize("Der Preis ist 5 €.", ["bg", "en"]);

    expect(Object.keys(seen[0]?.jsonSchema?.schema.properties as object)).toEqual(["text", "language"]);
    expect(result).toEqual({
      ok: true,
      normalizedText: "Der Preis ist 5 Euro.",
      language: "de",
      usedFallbackStructure: false,
    });
  });

  it("keeps the answer's shape after a prompt of the app's own", async () => {
    const { seen, chatClient } = recording('{"text":"Ahoy.","language":"en"}');
    const normalize = createLlmNormalizer({
      url: "http://engine/v1",
      model: "m",
      prompt: "Talk like a pirate.",
      chatClient,
    });

    await normalize("Hello.", ["en"]);

    expect(seen[0]?.system.startsWith("Talk like a pirate.")).toBe(true);
    expect(seen[0]?.system).toContain('{"text": "<the rewrite>"');
  });

  it("offers the caller's styles as an enum, so the model can only pick a declared one", async () => {
    const { seen, chatClient } = recording('{"text":"hello","language":"en","style":"amused"}');
    const normalize = createLlmNormalizer({
      url: "http://engine/v1",
      model: "m",
      chatClient,
      styleChoices: ["calm", "amused"],
    });

    const result = await normalize("hi", ["en"]);

    expect(seen[0]?.jsonSchema?.schema.properties).toEqual({
      text: { type: "string" },
      language: { type: "string" },
      style: { type: "string", enum: ["calm", "amused"] },
    });
    // Required, not optional: measured against a local model, an optional style was skipped by writing the
    // style word into the spoken text instead of into the field.
    expect(seen[0]?.jsonSchema?.schema.required).toEqual(["text", "language", "style"]);
    expect(seen[0]?.system).toContain('"style":');
    expect(seen[0]?.user).toContain("calm, amused");
    expect(result).toEqual({
      ok: true,
      normalizedText: "hello",
      language: "en",
      usedFallbackStructure: false,
      style: "amused",
    });
  });

  it("no style choices means no style field, and a style the model invents is passed on for the caller to drop", async () => {
    const { seen, chatClient } = recording('{"text":"hello","language":"en","style":"amused"}');
    const normalize = createLlmNormalizer({ url: "http://engine/v1", model: "m", chatClient });

    const result = await normalize("hi", ["en"]);

    expect(seen[0]?.jsonSchema?.schema.properties).not.toHaveProperty("style");
    expect(seen[0]?.jsonSchema?.schema.required).toEqual(["text", "language"]);
    expect(seen[0]?.system).not.toContain('"style":');
    expect(seen[0]?.user).toBe("hi");
    expect(result).toEqual({
      ok: true,
      normalizedText: "hello",
      language: "en",
      usedFallbackStructure: false,
      style: "amused",
    });
  });

  it("still accepts a fenced reply from an engine that ignores the schema", async () => {
    const normalize = createLlmNormalizer({
      url: "http://engine/v1",
      model: "m",
      chatClient: answer('```json\n{"text":"hello there","language":"en"}\n```'),
    });

    const result = await normalize("hi", ["en"]);

    expect(result).toEqual({ ok: true, normalizedText: "hello there", language: "en", usedFallbackStructure: false });
  });

  it("reports a coded failure when the engine returns prose", async () => {
    const normalize = createLlmNormalizer({
      url: "http://engine/v1",
      model: "m",
      chatClient: answer("sorry, no idea"),
    });

    const result = await normalize("hi", ["en"]);

    expect(result).toEqual({
      ok: false,
      errorCode: "NORMALIZE_BAD_RESPONSE",
      message: "engine did not return the expected JSON object",
    });
  });
});

describe("createLlmNormalizer — a rewrite must say what the reply says", () => {
  it("accepts a rewrite that keeps every number, however it groups them", async () => {
    const result = await rewriteTo("Revenue grew 4.2 percent to 1250000 dollars on March 11, 2026.")(
      "Revenue grew 4.2% to $1,250,000 on 3/11/2026.",
      ["en"],
    );

    expect(result.ok).toBe(true);
  });

  it("accepts a date whose month became a word", async () => {
    const result = await rewriteTo("Срещата е на 5 октомври 2026 година в 14:30 часа.")(
      "Срещата е на 05.10.2026 г. в 14:30 ч.",
      ["bg"],
    );

    expect(result.ok).toBe(true);
  });

  it("rejects a rewrite that changed a number", async () => {
    const result = await rewriteTo("EPS was 0.42 dollars versus 0.48 dollars.")("EPS was $0.42 vs. $0.38.", ["en"]);

    expect(result).toEqual({ ok: false, errorCode: "NORMALIZE_BAD_RESPONSE", message: "the rewrite changed a number" });
  });

  it("rejects a rewrite that spelled a number out, since its value can no longer be checked", async () => {
    const result = await rewriteTo("Цената е двадесет и пет лева.")("Цената е 25 лв.", ["bg"]);

    expect(result).toEqual({
      ok: false,
      errorCode: "NORMALIZE_BAD_RESPONSE",
      message: "the rewrite left out a number",
    });
  });

  it("rejects a rewrite that adds a number of its own", async () => {
    const result = await rewriteTo("Delivery takes 3 days.")("Delivery takes a few days.", ["en"]);

    expect(result).toEqual({ ok: false, errorCode: "NORMALIZE_BAD_RESPONSE", message: "the rewrite changed a number" });
  });

  it("lets list numbers, links and code go, and lets a table be summed up", async () => {
    const reply = [
      "Steps:",
      "1. Install it from https://example.com/v2/download",
      "2. Run `pnpm dev --port 5173`",
      "",
      "| Plan | Price |",
      "| --- | --- |",
      "| Pro | $12 |",
      "| Team | $49 |",
    ].join("\n");

    const summed = await rewriteTo("Install it from example dot com, then start the dev server. There are two plans.")(
      reply,
      ["en"],
    );
    const misread = await rewriteTo("Install it, then start it. Pro costs 13 dollars.")(reply, ["en"]);

    expect(summed.ok).toBe(true);
    expect(misread).toEqual({
      ok: false,
      errorCode: "NORMALIZE_BAD_RESPONSE",
      message: "the rewrite changed a number",
    });
  });

  it("rejects a rewrite in another writing system", async () => {
    const result = await rewriteTo("The price is 25 leva.")("Цената е 25 лв.", ["bg", "en"]);

    expect(result).toEqual({
      ok: false,
      errorCode: "NORMALIZE_BAD_RESPONSE",
      message: "the rewrite changed the language",
    });
  });

  it("accepts a reply that mixes writing systems, like Bulgarian with command names", async () => {
    const result = await rewriteTo("Пусни pnpm build и после pnpm test.")("Пусни `pnpm build` и после `pnpm test`.", [
      "bg",
    ]);

    expect(result.ok).toBe(true);
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
  const normalize = createLlmNormalizer({ url: LLM_URL, token: LLM_TOKEN, model: LLM_MODEL, timeoutSeconds: 90 });

  it("reads symbols, money and code for the ear and keeps every number", { timeout: 120_000 }, async () => {
    const result = await normalize("Revenue grew 4.2% to $1,250,000 on 3/11/2026.\n\n```js\nlet x = 1;\n```", [
      "bg",
      "en",
    ]);

    if (!result.ok) {
      throw new Error(`${result.errorCode}: ${result.message}`);
    }

    expect(result.normalizedText).not.toMatch(/```|\$|%/);
    expect(result.normalizedText).toContain("2026");
  });

  it("keeps a Bulgarian reply in Bulgarian", { timeout: 120_000 }, async () => {
    const result = await normalize("Цената е 25 лв., а с ДДС — 30 лв.", ["bg", "en"]);

    if (!result.ok) {
      throw new Error(`${result.errorCode}: ${result.message}`);
    }

    expect(result.normalizedText).toMatch(/[а-я]/);
    expect(result.normalizedText).not.toContain("лв.");
  });
});

describe("parseNormalized — the optional style", () => {
  it("keeps a style the engine returned as a string", () => {
    expect(parseNormalized('{"language":"en","text":"hi","style":"calm"}')).toEqual({
      text: "hi",
      language: "en",
      style: "calm",
    });
  });

  it("a null, blank or non-string style is left out", () => {
    expect(parseNormalized('{"language":"en","text":"hi","style":null}')).toEqual({ text: "hi", language: "en" });
    expect(parseNormalized('{"language":"en","text":"hi","style":"  "}')).toEqual({ text: "hi", language: "en" });
    expect(parseNormalized('{"language":"en","text":"hi","style":7}')).toEqual({ text: "hi", language: "en" });
  });

  it("a style still parses from a loose reply", () => {
    expect(parseNormalized('sure: {"language":"en","text":"hi","style":"calm"} ok')).toEqual({
      text: "hi",
      language: "en",
      style: "calm",
    });
  });
});
