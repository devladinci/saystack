import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { SttErrorCode } from "@saystack/core";

export function statusForErrorCode(code: SttErrorCode): ContentfulStatusCode {
  if (code === "EMPTY_AUDIO" || code === "RECORDING_TOO_SHORT") {
    return 400;
  }

  if (code === "AUDIO_TOO_LARGE") {
    return 413;
  }

  if (code === "UNSUPPORTED_MEDIA") {
    return 415;
  }

  if (code === "NO_ADAPTER") {
    return 503;
  }

  return 502;
}
