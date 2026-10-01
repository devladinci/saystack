import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { TtsErrorCode } from "@saystack/core";

export function statusForSpeechErrorCode(code: TtsErrorCode): ContentfulStatusCode {
  if (code === "TEXT_TOO_LONG") {
    return 413;
  }

  if (code === "EMPTY_TEXT" || code === "TTS_UNSUPPORTED_MEDIA") {
    return 400;
  }

  if (code === "TTS_RETRYABLE") {
    return 503;
  }

  return 502;
}
