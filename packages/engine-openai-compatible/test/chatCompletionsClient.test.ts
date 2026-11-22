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
  it("switches thinking off both ways servers understand, and only when asked to", async () => {
    const { fetchFn, sentBody } = capture();

    await httpChatComplete({ ...REQUEST, disableThinking: true }, "http://engine/v1/chat/completions", fetchFn);
    await httpChatComplete(REQUEST, "http://engine/v1/chat/completions", fetchFn);

    expect(sentBody(0).chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(sentBody(0).reasoning_effort).toBe("none");
    expect("chat_template_kwargs" in sentBody(1)).toBe(false);
    expect("reasoning_effort" in sentBody(1)).toBe(false);
  });

  it("stops when the caller's signal aborts, and says so as a timeout", async () => {
    const caller = new AbortController();
    const fetchFn = (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    const pending = httpChatComplete(
      { ...REQUEST, signal: caller.signal },
      "http://engine/v1/chat/completions",
      fetchFn,
    );

    caller.abort();

    expect(await pending).toMatchObject({ ok: false, errorCode: "LLM_TIMEOUT" });
  });

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
