import { afterEach, describe, expect, it, vi } from "vitest";

import { unlockWebAudio } from "../src/audioContext.js";
import { createAudioLevels } from "../src/audioLevels.js";
import { createWebClip } from "../src/webClip.js";
import { createWebTtsDriver } from "../src/webTtsDriver.js";
import { fakeAudio } from "./fakeAudio.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("unlockWebAudio", () => {
  it("does nothing where Web Audio is missing", () => {
    vi.stubGlobal("AudioContext", undefined);

    expect(() => unlockWebAudio()).not.toThrow();
  });

  it("resumes a suspended context", () => {
    const resume = vi.fn(async () => undefined);

    unlockWebAudio({ state: "suspended", resume } as unknown as AudioContext);

    expect(resume).toHaveBeenCalledOnce();
  });
});

describe("createWebClip", () => {
  it("knows its length and the shape of the speech", async () => {
    const audio = fakeAudio(2);
    const clip = await createWebClip(new ArrayBuffer(8), { context: audio.context });

    expect(clip.duration).toBe(2);
    expect(clip.envelope?.duration).toBe(2);
  });

  it("settles play when the audio ends by itself", async () => {
    const audio = fakeAudio(2);
    const clip = await createWebClip(new ArrayBuffer(8), { context: audio.context });
    const played = clip.play();

    audio.sources[0]?.end();

    await expect(played).resolves.toBeUndefined();
  });

  it("pauses and resumes from the same spot", async () => {
    const audio = fakeAudio(4);
    const clip = await createWebClip(new ArrayBuffer(8), { context: audio.context });
    let isSettled = false;

    void clip.play().then(() => {
      isSettled = true;
    });
    audio.setTime(1.5);
    clip.pause?.();
    audio.setTime(9);

    expect(clip.currentTime).toBe(1.5);

    clip.resume?.();
    await Promise.resolve();

    expect(audio.sources[1]?.offset).toBe(1.5);
    expect(isSettled).toBe(false);
  });

  it("seeks while playing by restarting at the new spot", async () => {
    const audio = fakeAudio(4);
    const clip = await createWebClip(new ArrayBuffer(8), { context: audio.context });

    void clip.play();
    clip.seek?.(3);

    expect(audio.sources[0]?.isStopped).toBe(true);
    expect(audio.sources[1]?.offset).toBe(3);
    expect(clip.currentTime).toBe(3);
  });

  it("starts from a spot chosen before playing", async () => {
    const audio = fakeAudio(4);
    const clip = await createWebClip(new ArrayBuffer(8), { context: audio.context });

    clip.seek?.(2.5);
    void clip.play();

    expect(audio.sources[0]?.offset).toBe(2.5);
  });

  it("does not rewind when told to start at the very end", async () => {
    const audio = fakeAudio(2);
    const clip = await createWebClip(new ArrayBuffer(8), { context: audio.context });

    clip.seek?.(2);
    void clip.play();

    expect(audio.sources[0]?.offset).toBe(2);
  });

  it("plays from the top again after it ended", async () => {
    const audio = fakeAudio(2);
    const clip = await createWebClip(new ArrayBuffer(8), { context: audio.context });

    void clip.play();
    audio.sources[0]?.end();
    void clip.play();

    expect(audio.sources[1]?.offset).toBe(0);
  });

  it("settles play when stopped", async () => {
    const audio = fakeAudio(4);
    const clip = await createWebClip(new ArrayBuffer(8), { context: audio.context });
    const played = clip.play();

    clip.stop();

    await expect(played).resolves.toBeUndefined();
  });
});

describe("createWebTtsDriver", () => {
  it("posts the text and returns the audio", async () => {
    const fetch = vi.fn(
      async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/wav" } }),
    );
    const driver = createWebTtsDriver({ endpoint: "/voice/speech", fetch });

    const result = await driver.synthesize({ text: "Hello.", refAudio: "clip", refText: "words" });

    expect(result).toMatchObject({ ok: true, mimeType: "audio/wav" });
    expect(fetch).toHaveBeenCalledWith(
      "/voice/speech",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "Hello.", refAudio: "clip", refText: "words" }),
      }),
    );
  });

  it("passes the server's error code through", async () => {
    const fetch = vi.fn(async () => Response.json({ errorCode: "TTS_RETRYABLE", message: "busy" }, { status: 503 }));
    const driver = createWebTtsDriver({ endpoint: "/voice/speech", fetch });

    expect(await driver.synthesize({ text: "Hello." })).toEqual({
      ok: false,
      errorCode: "TTS_RETRYABLE",
      message: "busy",
    });
  });

  it("unlocks quietly where there is no Web Audio", () => {
    vi.stubGlobal("AudioContext", undefined);
    const driver = createWebTtsDriver({ endpoint: "/voice/speech" });

    expect(() => driver.unlock?.()).not.toThrow();
  });

  it("reads the headers for every request, so a changed token is picked up", async () => {
    let token = "first";
    const fetch = vi.fn(async (_input: string, _init: RequestInit) => new Response(new Uint8Array([1])));
    const driver = createWebTtsDriver({
      endpoint: "/voice/speech",
      headers: () => ({ Authorization: `Bearer ${token}` }),
      fetch,
    });

    await driver.synthesize({ text: "One." });
    token = "second";
    await driver.synthesize({ text: "Two." });

    expect(fetch.mock.calls.map(([, init]) => (init.headers as Record<string, string>).Authorization)).toEqual([
      "Bearer first",
      "Bearer second",
    ]);
  });

  it("keeps the words of a plain error body", async () => {
    const fetch = vi.fn(async () => Response.json({ error: "No text-to-speech model selected" }, { status: 400 }));
    const driver = createWebTtsDriver({ endpoint: "/voice/speech", fetch });

    expect(await driver.synthesize({ text: "Hello." })).toEqual({
      ok: false,
      errorCode: "TTS_FAILED",
      message: "No text-to-speech model selected",
    });
  });

  it("reports an unknown error code as a failure", async () => {
    const fetch = vi.fn(async () => Response.json({ errorCode: "SOMETHING_ELSE" }, { status: 500 }));
    const driver = createWebTtsDriver({ endpoint: "/voice/speech", fetch });

    expect(await driver.synthesize({ text: "Hello." })).toEqual({
      ok: false,
      errorCode: "TTS_FAILED",
      message: "speech endpoint said 500",
    });
  });

  it("reports an unreachable endpoint", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const driver = createWebTtsDriver({ endpoint: "/voice/speech", fetch });

    expect(await driver.synthesize({ text: "Hello." })).toMatchObject({ ok: false, errorCode: "TTS_UNAVAILABLE" });
  });

  it("turns undecodable audio into a coded clip failure", async () => {
    const audio = fakeAudio();
    const context = { ...audio.context, decodeAudioData: async () => Promise.reject(new Error("bad header")) };
    const driver = createWebTtsDriver({ endpoint: "/voice/speech", context: context as unknown as AudioContext });

    expect(await driver.createClip(new ArrayBuffer(8))).toEqual({
      ok: false,
      errorCode: "TTS_UNSUPPORTED_MEDIA",
      message: "bad header",
    });
  });
});

describe("createAudioLevels", () => {
  it("reads band levels from the analyser", () => {
    const audio = fakeAudio();
    const levels = createAudioLevels({ context: audio.context, bands: 6 });
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);

    audio.spectrum.fill(-100);
    levels.read();
    audio.spectrum.fill(-30, 3, 40);

    for (let frame = 0; frame < 20; frame += 1) {
      now += 16;
      levels.read();
    }

    expect(levels.levels).toHaveLength(6);
    expect(Math.max(...levels.levels)).toBeGreaterThan(0.3);
  });

  it("changes the number of bands", () => {
    const audio = fakeAudio();
    const levels = createAudioLevels({ context: audio.context, bands: 6 });

    levels.setBands(8);

    expect(levels.levels).toHaveLength(8);
  });
});
