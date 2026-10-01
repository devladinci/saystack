import { afterEach, describe, expect, it, vi } from "vitest";

import { sendDictation } from "../src/dictationSender.js";

const RECORDING = { blob: new Blob([new Uint8Array(4)], { type: "audio/webm" }) };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendDictation", () => {
  it("keeps both the language and the duration the server reports", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ text: "hello", language: "en", durationSeconds: 1.5 }));

    const result = await sendDictation("/voice/audio/transcriptions", RECORDING, {});

    expect(result).toEqual({ ok: true, text: "hello", language: "en", durationSeconds: 1.5 });
  });
});
