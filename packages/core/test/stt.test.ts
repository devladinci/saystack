import { describe, expect, it } from "vitest";

import type { ISttAdapter, ISttTranscribeInput, ISttTranscribeResult, SttErrorCode } from "../src/stt.js";

describe("SttErrorCode — the fixed list carries the reviewer's missing codes", () => {
  it("names auth, model, timeout, retry and device problems distinctly", () => {
    const codes: readonly SttErrorCode[] = [
      "NO_ADAPTER",
      "EMPTY_AUDIO",
      "AUDIO_TOO_LARGE",
      "ENGINE_UNAVAILABLE",
      "BAD_TOKEN",
      "MODEL_NOT_FOUND",
      "LANGUAGE_UNSUPPORTED",
      "UNSUPPORTED_MEDIA",
      "TIMEOUT",
      "RETRYABLE",
      "ENGINE_REJECTED_INPUT",
      "RECORDING_TOO_SHORT",
      "MIC_PERMISSION_DENIED",
      "MIC_UNAVAILABLE",
      "RECORDING_UNSUPPORTED",
      "TRANSCRIPTION_FAILED",
    ];

    expect(codes.length).toBe(16);
  });
});

describe("ISttTranscribeInput — cancellation is part of the contract", () => {
  it("accepts a signal and the adapter respects it", async () => {
    const slowEngine: ISttAdapter = {
      capabilities: { streaming: false, interimResults: false, wordTimings: false, languages: [] },
      transcribe: async (input: ISttTranscribeInput): Promise<ISttTranscribeResult> => {
        const signal = input.signal;

        if (signal !== undefined && signal.aborted) {
          return { ok: false, errorCode: "TIMEOUT", message: "cancelled" };
        }

        return new Promise((resolve) => {
          const timer = setTimeout(() => resolve({ ok: true, text: "late" }), 5000);

          signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);

              resolve({ ok: false, errorCode: "TIMEOUT", message: "cancelled" });
            },
            { once: true },
          );
        });
      },
    };

    const controller = new AbortController();

    const pending = slowEngine.transcribe({ audio: new Uint8Array([1]), signal: controller.signal });

    controller.abort();

    const result = await pending;

    if (result.ok) throw new Error("expected a coded cancellation");
    expect(result.errorCode).toBe("TIMEOUT");
  });
});
