import { describe, expect, it } from "vitest";

import { getVoiceRecorder, setVoiceRecorder } from "../src/platform.js";

describe("voice recorder seam", () => {
  it("before registration says NO_PLATFORM, not a fake recorder", () => {
    const result = getVoiceRecorder();
    if (result.ok) throw new Error("expected unregistered");
    expect(result.errorCode).toBe("NO_PLATFORM");
  });

  it("after registration hands back the recorder (same object)", () => {
    const recorder = { startRecording: async () => {}, stopRecording: async () => ({ blob: new Blob() }) };
    setVoiceRecorder(recorder);

    const result = getVoiceRecorder();
    if (!result.ok) throw new Error("expected registered");
    expect(result.recorder).toBe(recorder);
  });
});