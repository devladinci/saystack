export type LlmErrorCode = "LLM_UNAVAILABLE" | "LLM_TIMEOUT" | "LLM_RETRYABLE" | "LLM_BAD_RESPONSE";

export interface ILlmChatRequest {
  model: string;
  system: string;
  user: string;
  timeoutMs?: number;
  disableThinking?: boolean;
  token?: string;
}

export type ILlmChatResponse = { ok: true; content: string } | { ok: false; errorCode: LlmErrorCode; message: string };

export interface ILlmChatClient {
  complete(request: ILlmChatRequest): Promise<ILlmChatResponse>;
}
