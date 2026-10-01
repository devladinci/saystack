export type NormalizeErrorCode =
  "NORMALIZE_FAILED" | "NORMALIZE_TIMEOUT" | "NORMALIZE_BAD_RESPONSE" | "NORMALIZE_REFUSED" | "NORMALIZE_RETRYABLE";

export type INormalizeResult =
  | {
      ok: true;
      normalizedText: string;
      language: string;
      usedFallbackStructure: boolean;
      // The delivery style the rewriter chose, when the caller offered any.
      style?: string;
    }
  | { ok: false; errorCode: NormalizeErrorCode; message: string };

export interface INormalizeFn {
  (text: string, languages: readonly string[]): Promise<INormalizeResult>;
}
