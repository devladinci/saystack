import { describe, expect, it } from "vitest";
import { httpChatComplete } from "../src/chatCompletionsClient.js";
import type { ILlmChatRequest } from "../src/llmTypes.js";

const REQUEST: ILlmChatRequest = { model: "m", system: "s", user: "u" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function capture() {
  const calls: Record<string, unknown>[] = [];
  const fetchFn = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return jsonResponse({ choices: [{ message: { content: '{"language":"bg","text":"да"}' } }] });
  };
  const sentBody = (index: number): Record<string, unknown> => {
    const body = calls[index];

    if (body === undefined) {
      throw new Error(`no request captured at ${index}`);
    }

    return body;
  };

  return { fetchFn, sentBody };
}

describe("httpChatComplete", () => {
  it("omits response_format when no schema is requested", async () => {
    const { fetchFn, sentBody } = capture();

    await httpChatComplete(REQUEST, "http://engine/v1/chat/completions", fetchFn);

    expect("response_format" in sentBody(0)).toBe(false);
  });

  it("sends a json_schema response_format when a schema is requested", async () => {
    const { fetchFn, sentBody } = capture();
    const schema = { type: "object", properties: { language: { type: "string" } }, required: ["language"] };

    await httpChatComplete(
      { ...REQUEST, jsonSchema: { name: "speech", schema } },
      "http://engine/v1/chat/completions",
      fetchFn,
    );

    expect(sentBody(0).response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "speech", schema },
    });
  });

  it("maps a rejection to a coded error instead of throwing", async () => {
    const fetchFn = async () => jsonResponse({ error: "nope" }, 503);

    const result = await httpChatComplete(REQUEST, "http://engine/v1/chat/completions", fetchFn);

    expect(result).toEqual({ ok: false, errorCode: "LLM_RETRYABLE", message: "engine said 503" });
  });
});
