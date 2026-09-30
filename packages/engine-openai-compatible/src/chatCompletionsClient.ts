import type { ILlmChatRequest, ILlmChatResponse, LlmErrorCode } from "./llmTypes.js";

interface IChatChoiceMessage {
  content?: unknown;
}

interface IChatChoice {
  message?: IChatChoiceMessage;
}

interface IChatResponseShape {
  choices?: unknown;
}

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

function statusToLlmErrorCode(status: number): LlmErrorCode {
  if (status === 401 || status === 403) {
    return "LLM_UNAVAILABLE";
  }

  if (status === 429 || status === 503) {
    return "LLM_RETRYABLE";
  }

  return "LLM_BAD_RESPONSE";
}

export async function httpChatComplete(
  request: ILlmChatRequest,
  url: string,
  fetchFn: FetchFn = fetch,
): Promise<ILlmChatResponse> {
  const timeoutMs = request.timeoutMs ?? 30_000;

  try {
    const headers: Record<string, string> = { "content-type": "application/json" };

    if (request.token !== undefined) {
      headers.authorization = `Bearer ${request.token}`;
    }

    const response = await fetchFn(url, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model: request.model,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
        temperature: 0,
        ...(request.disableThinking === true ? { chat_template_kwargs: { enable_thinking: false } } : {}),
        ...(request.jsonSchema !== undefined
          ? {
              response_format: {
                type: "json_schema",
                json_schema: { name: request.jsonSchema.name, schema: request.jsonSchema.schema },
              },
            }
          : {}),
      }),
    });

    if (!response.ok) {
      const message = `engine said ${response.status}`;
      const errorCode = statusToLlmErrorCode(response.status);
      return { ok: false, errorCode, message };
    }

    const parsed = (await response.json()) as IChatResponseShape;
    const choices = parsed.choices;

    if (!Array.isArray(choices) || choices.length === 0) {
      return { ok: false, errorCode: "LLM_BAD_RESPONSE", message: "engine returned no choices" };
    }

    const content = (choices[0] as IChatChoice).message?.content;

    if (typeof content !== "string" || content.trim().length === 0) {
      return { ok: false, errorCode: "LLM_BAD_RESPONSE", message: "engine returned empty content" };
    }

    return { ok: true, content };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";

    if (name === "TimeoutError" || name === "AbortError") {
      return { ok: false, errorCode: "LLM_TIMEOUT", message: "engine did not answer in time" };
    }

    return {
      ok: false,
      errorCode: "LLM_UNAVAILABLE",
      message: error instanceof Error ? error.message : "engine unreachable",
    };
  }
}
