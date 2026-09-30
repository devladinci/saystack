import type { TtsErrorCode } from "@saystack/core";

export interface IPlayerLabels {
  region: string;
  preparing: string;
  finished: string;
  pause: string;
  resume: string;
  replay: string;
  retry: string;
  stop: string;
  previous: string;
  next: string;
  locate: string;
  close: string;
  part: (index: number, total: number) => string;
  errors: Partial<Record<TtsErrorCode, string>>;
  failed: string;
}

export const DEFAULT_PLAYER_LABELS: IPlayerLabels = {
  region: "Read aloud",
  preparing: "Preparing audio…",
  finished: "Finished",
  pause: "Pause",
  resume: "Resume",
  replay: "Replay",
  retry: "Retry",
  stop: "Stop",
  previous: "Previous part",
  next: "Next part",
  locate: "Show the current word",
  close: "Close",
  part: (index, total) => `Part ${index} of ${total}`,
  errors: {
    EMPTY_TEXT: "There is nothing to read in this reply.",
    BAD_TOKEN: "The speech engine rejected the key.",
    MODEL_NOT_FOUND: "The voice model is not available.",
    TTS_UNAVAILABLE: "The speech engine can't be reached.",
    TTS_RETRYABLE: "The speech engine is busy. Try again.",
    TTS_TIMEOUT: "The speech engine took too long.",
    TTS_UNSUPPORTED_MEDIA: "The audio could not be played.",
  },
  failed: "Reading aloud failed.",
};
