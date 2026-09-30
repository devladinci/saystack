import type { INormalizeFn, INormalizeResult } from "@saystack/core";
import { httpChatComplete } from "./chatCompletionsClient.js";
import { buildNormalizeSystemPrompt, buildNormalizeUserPrompt } from "./normalizePrompt.js";
import type { ILlmChatClient } from "./llmTypes.js";
import { normalizeBaseUrl } from "./omlxSttAdapter.js";

export interface IChatCompletionsSpec {
  url: string;
  token?: string;
  model: string;
  prompt?: string;
  disableThinking?: boolean;
  timeoutSeconds?: number;
  chatClient?: ILlmChatClient;
}

export function createLlmNormalizer(spec: IChatCompletionsSpec): INormalizeFn {
  return (text, languages) => normalizeWithChat(spec, text, languages);
}

function joinUrl(base: string): string {
  return `${normalizeBaseUrl(base).replace(/\/chat\/completions$/, "")}/chat/completions`;
}

async function normalizeWithChat(
  spec: IChatCompletionsSpec,
  text: string,
  languages: readonly string[],
): Promise<INormalizeResult> {
  const empty: INormalizeResult = { ok: false, errorCode: "NORMALIZE_FAILED", message: "empty input" };

  if (text.trim().length === 0) {
    return empty;
  }

  const timeoutMs = (spec.timeoutSeconds ?? 30) * 1000;
  const system = spec.prompt ?? buildNormalizeSystemPrompt(languages);
  const chatResponse = await runChat(spec, system, buildNormalizeUserPrompt(text), timeoutMs);

  if (!chatResponse.ok) {
    return {
      ok: false,
      errorCode: toNormalizeErrorCode(chatResponse.errorCode),
      message: chatResponse.message,
    };
  }

  const parsed = parseNormalized(chatResponse.content);

  if (parsed === null) {
    return {
      ok: false,
      errorCode: "NORMALIZE_BAD_RESPONSE",
      message: "engine did not return the expected JSON object",
    };
  }

  return {
    ok: true,
    normalizedText: parsed.text,
    language: parsed.language,
    usedFallbackStructure: false,
  };
}

function runChat(spec: IChatCompletionsSpec, system: string, user: string, timeoutMs: number) {
  if (spec.chatClient !== undefined) {
    return spec.chatClient.complete({
      model: spec.model,
      system,
      user,
      timeoutMs,
      ...(spec.disableThinking !== undefined ? { disableThinking: spec.disableThinking } : {}),
      ...(spec.token !== undefined ? { token: spec.token } : {}),
    });
  }

  return httpChatComplete(
    {
      model: spec.model,
      system,
      user,
      timeoutMs,
      ...(spec.disableThinking !== undefined ? { disableThinking: spec.disableThinking } : {}),
      ...(spec.token !== undefined ? { token: spec.token } : {}),
    },
    joinUrl(spec.url),
  );
}

function toNormalizeErrorCode(code: "LLM_UNAVAILABLE" | "LLM_TIMEOUT" | "LLM_RETRYABLE" | "LLM_BAD_RESPONSE") {
  if (code === "LLM_UNAVAILABLE") {
    return "NORMALIZE_FAILED";
  }

  if (code === "LLM_TIMEOUT") {
    return "NORMALIZE_TIMEOUT";
  }

  if (code === "LLM_RETRYABLE") {
    return "NORMALIZE_RETRYABLE";
  }

  return "NORMALIZE_BAD_RESPONSE";
}

export function parseNormalized(content: string): { text: string; language: string } | null {
  const stripped = stripFences(content);

  try {
    const parsed = JSON.parse(stripped) as unknown;

    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    const text = record.text;
    const language = record.language;

    if (typeof text !== "string" || text.trim().length === 0) {
      return null;
    }

    if (typeof language !== "string" || language.trim().length === 0) {
      return null;
    }

    return { text, language: language.trim() };
  } catch {
    return extractLooseJson(stripped);
  }
}

function stripFences(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);

  if (fenced !== null) {
    return (fenced[1] ?? content).trim();
  }

  return content.trim();
}

function extractLooseJson(content: string): { text: string; language: string } | null {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");

  if (start === -1 || end <= start) {
    return null;
  }

  try {
    const parsed = JSON.parse(content.slice(start, end + 1)) as unknown;

    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    const text = record.text;
    const language = record.language;

    if (typeof text !== "string" || text.trim().length === 0) {
      return null;
    }

    if (typeof language !== "string" || language.trim().length === 0) {
      return null;
    }

    return { text, language: language.trim() };
  } catch {
    return null;
  }
}
