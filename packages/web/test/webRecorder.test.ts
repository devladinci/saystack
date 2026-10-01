import { afterEach, describe, expect, it, vi } from "vitest";

import { createWebRecorder } from "../src/webRecorder.js";

class FakeRecorder extends EventTarget {
  static made: FakeRecorder[] = [];
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm";

  constructor() {
    super();
    FakeRecorder.made.push(this);
  }

  deliver(text: string): void {
    this.dispatchEvent(Object.assign(new Event("dataavailable"), { data: new Blob([text]) }));
  }

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
  FakeRecorder.made = [];
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

  it("keeps a released recorder's late audio out of the next take", async () => {
    const track = { stop: vi.fn() };
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track] }) as unknown as MediaStream },
    });
    const recorder = createWebRecorder();

    await recorder.startRecording();
    await recorder.startRecording();
    const [released, current] = FakeRecorder.made;
    released?.deliver("late");
    current?.deliver("fresh");
    const recording = await recorder.stopRecording();

    expect("blob" in recording ? await recording.blob.text() : null).toBe("fresh");
  });
});
