import { afterEach, describe, expect, it, vi } from "vitest";

import { createWebRecorder } from "../src/webRecorder.js";

class FakeRecorder extends EventTarget {
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm";

  start(): void {
    this.state = "recording";
  }

  stop(): void {
    this.state = "inactive";
    this.dispatchEvent(new Event("stop"));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createWebRecorder", () => {
  it("still closes the microphone when stop comes before it finished opening", async () => {
    const track = { stop: vi.fn() };
    let grant: (stream: MediaStream) => void = () => undefined;
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: () =>
          new Promise<MediaStream>((resolve) => {
            grant = resolve;
          }),
      },
    });
    const recorder = createWebRecorder();

    const starting = recorder.startRecording();
    const stopping = recorder.stopRecording();
    grant({ getTracks: () => [track] } as unknown as MediaStream);
    await starting;

    await expect(stopping).resolves.toMatchObject({ blob: expect.any(Blob) });
    expect(track.stop).toHaveBeenCalled();
    expect(recorder.stream).toBeNull();
  });
});
