import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IDictationInput, IPlatformRecorder, LiveTranscriptionFactory } from "@saystack/core";

import { sendDictation } from "../src/dictationSender.js";
import { setVoiceRecorder } from "@saystack/core";
import { useDictation } from "../src/useDictation.js";

const ENDPOINT = "https://voice.test/v1/audio/transcriptions";

function startSpy(): Promise<void> {
  return Promise.resolve();
}

function blobRecorder(): IPlatformRecorder {
  return {
    startRecording: startSpy,
    stopRecording: async () => ({ blob: new Blob(["audio-bytes"], { type: "audio/webm" }) }),
  };
}

function mockFetchJson(body: unknown, status = 200): void {
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useDictation state machine (offline, mocked endpoints)", () => {
  it("without a registered recorder pressing start surfaces NO_PLATFORM", () => {
    const { result } = renderHook(() => useDictation({ endpoint: ENDPOINT }));

    act(() => {
      result.current.handlePressStart();
    });

    expect(result.current.state).toBe("error");
    expect(result.current.errorCode).toBe("NO_PLATFORM");
  });

  it("full press cycle: recording → transcribing → done, text surfaces, onText fires", async () => {
    setVoiceRecorder(blobRecorder());
    mockFetchJson({ text: "hello there" });
    const onText = vi.fn();
    const { result } = renderHook(() => useDictation({ endpoint: ENDPOINT, onText }));

    act(() => {
      result.current.handlePressStart();
    });
    expect(result.current.state).toBe("recording");

    await act(async () => {
      await result.current.handlePressEnd();
    });

    expect(result.current.state).toBe("done");
    expect(result.current.text).toBe("hello there");
    expect(onText).toHaveBeenCalledWith("hello there");
    expect(result.current.errorCode).toBeUndefined();
  });

  it("engine 401 through the endpoint is BAD_TOKEN, not a vague failure", async () => {
    setVoiceRecorder(blobRecorder());
    mockFetchJson({ errorCode: "BAD_TOKEN", message: "engine said 401" }, 502);
    const { result } = renderHook(() => useDictation({ endpoint: ENDPOINT }));

    act(() => {
      result.current.handlePressStart();
    });
    await act(async () => {
      await result.current.handlePressEnd();
    });

    expect(result.current.state).toBe("error");
    expect(result.current.errorCode).toBe("BAD_TOKEN");
  });

  it("network death is ENGINE_UNAVAILABLE, coded not thrown", async () => {
    setVoiceRecorder(blobRecorder());
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    const { result } = renderHook(() => useDictation({ endpoint: ENDPOINT }));

    act(() => {
      result.current.handlePressStart();
    });
    await act(async () => {
      await result.current.handlePressEnd();
    });

    expect(result.current.state).toBe("error");
    expect(result.current.errorCode).toBe("ENGINE_UNAVAILABLE");
  });

  it("a second press during transcribing is ignored — no double send", async () => {
    setVoiceRecorder(blobRecorder());
    mockFetchJson({ text: "one" });
    const fetchSpy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ text: "one" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useDictation({ endpoint: ENDPOINT }));

    act(() => {
      result.current.handlePressStart();
    });
    await act(async () => {
      await result.current.handlePressEnd();
    });
    expect(result.current.state).toBe("done");

    await act(async () => {
      await result.current.handlePressEnd();
    });
    expect(result.current.state).toBe("done");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("mic start failure is coded MIC_UNAVAILABLE, not thrown", async () => {
    setVoiceRecorder({
      startRecording: async () => {
        throw new DOMException("no mic", "NotFoundError");
      },
      stopRecording: async () => ({ blob: new Blob() }),
    });
    const { result } = renderHook(() => useDictation({ endpoint: ENDPOINT }));

    act(() => {
      result.current.handlePressStart();
    });
    await act(async () => {});

    expect(result.current.state).toBe("error");
    expect(result.current.errorCode).toBe("MIC_UNAVAILABLE");
  });
});

describe("sendDictation (sender, direct)", () => {
  it("sends multipart with the recording blob", async () => {
    const fetchSpy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ text: "ok" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendDictation(ENDPOINT, { blob: new Blob(["x"], { type: "audio/webm" }) }, {});

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toBe("ok");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(ENDPOINT);
  });

  it("the hook's language hint rides along with the upload", async () => {
    setVoiceRecorder(blobRecorder());
    const fetchSpy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ text: "zdravei" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useDictation({ endpoint: ENDPOINT, language: "bg" }));

    act(() => {
      result.current.handlePressStart();
    });
    await act(async () => {
      await result.current.handlePressEnd();
    });

    const body = fetchSpy.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get("language")).toBe("bg");
  });

  it("non-json garbage response parses as TRANSCRIPTION_FAILED, not a crash", async () => {
    vi.stubGlobal("fetch", async () => new Response("<html>oops</html>", { status: 500 }));

    const result = await sendDictation(ENDPOINT, { blob: new Blob(["x"]) }, {});

    if (result.ok) throw new Error("expected failure");
    expect(result.errorCode).toBe("TRANSCRIPTION_FAILED");
  });
});
interface IFakeLive {
  factory: LiveTranscriptionFactory;
  hear: (text: string) => void;
  cancel: ReturnType<typeof vi.fn>;
}

function fakeLive(isLive: boolean, finished: string | null): IFakeLive {
  let onText: (text: string) => void = () => undefined;
  const cancel = vi.fn();
  const factory: LiveTranscriptionFactory = (_recorder, handleText) => {
    onText = handleText;
    return { isLive, finish: async () => finished, cancel };
  };

  return { factory, hear: (text) => onText(text), cancel };
}

function fakeInput(): { input: IDictationInput; shown: string[]; ended: (string | null)[] } {
  const shown: string[] = [];
  const ended: (string | null)[] = [];

  return { input: { show: (text) => shown.push(text), end: (text) => ended.push(text) }, shown, ended };
}

describe("useDictation live", () => {
  const press = async (result: { current: ReturnType<typeof useDictation> }, heard?: () => void) => {
    act(() => {
      result.current.handlePressStart();
    });
    heard?.();
    await act(async () => {
      result.current.handlePressEnd();
    });
  };

  it("streams the words into the input and keeps the streamed text without an upload", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const live = fakeLive(true, "Hello there.");
    const field = fakeInput();
    const onText = vi.fn();
    const { result } = renderHook(() =>
      useDictation({ endpoint: ENDPOINT, recorder: blobRecorder(), live: live.factory, input: field.input, onText }),
    );

    await press(result, () => {
      live.hear("Hello");
      live.hear("Hello there");
    });

    expect(field.shown).toEqual(["Hello", "Hello there"]);
    expect(field.ended).toEqual(["Hello there."]);
    expect(result.current.state).toBe("done");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onText).not.toHaveBeenCalled();
  });

  it("transcribes the recording when the stream broke off, and still writes into the input", async () => {
    mockFetchJson({ text: "From the recording." });
    const field = fakeInput();
    const { result } = renderHook(() =>
      useDictation({
        endpoint: ENDPOINT,
        recorder: blobRecorder(),
        live: fakeLive(true, null).factory,
        input: field.input,
      }),
    );

    await press(result);

    expect(field.ended).toEqual(["From the recording."]);
  });

  it("hands the text to onText when the engine never streamed", async () => {
    mockFetchJson({ text: "Sent as a message." });
    const field = fakeInput();
    const onText = vi.fn();
    const { result } = renderHook(() =>
      useDictation({
        endpoint: ENDPOINT,
        recorder: blobRecorder(),
        live: fakeLive(false, null).factory,
        input: field.input,
        onText,
      }),
    );

    await press(result);

    expect(onText).toHaveBeenCalledWith("Sent as a message.");
    expect(field.ended).toEqual([]);
  });

  it("drops the recording and the streamed words on cancel", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const live = fakeLive(true, "unused");
    const field = fakeInput();
    const { result } = renderHook(() =>
      useDictation({ endpoint: ENDPOINT, recorder: blobRecorder(), live: live.factory, input: field.input }),
    );

    act(() => {
      result.current.handlePressStart();
    });
    live.hear("not this");
    await act(async () => {
      result.current.handleCancel();
    });

    expect(live.cancel).toHaveBeenCalledOnce();
    expect(field.ended).toEqual([null]);
    expect(result.current.state).toBe("idle");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps what was already shown when the stream and the fallback both fail", async () => {
    mockFetchJson({ error: "No speech-to-text model selected" }, 400);
    const live = fakeLive(true, null);
    const field = fakeInput();
    const { result } = renderHook(() =>
      useDictation({ endpoint: ENDPOINT, recorder: blobRecorder(), live: live.factory, input: field.input }),
    );

    await press(result, () => live.hear("Half a sentence"));

    expect(field.ended).toEqual(["Half a sentence"]);
    expect(result.current.state).toBe("error");
    expect(result.current.errorMessage).toBe("No speech-to-text model selected");
  });

  it("uses a custom transcribe instead of the upload", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const transcribe = vi.fn(async () => ({ ok: true as const, text: "Mine." }));
    const onText = vi.fn();
    const { result } = renderHook(() => useDictation({ recorder: blobRecorder(), transcribe, onText }));

    await press(result);

    expect(transcribe).toHaveBeenCalledWith({ blob: expect.any(Blob) }, expect.any(AbortSignal));
    expect(onText).toHaveBeenCalledWith("Mine.");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("sendDictation headers and bodies", () => {
  it("names the file after its type and reads the headers per request", async () => {
    const fetchSpy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ text: "ok" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const append = vi.spyOn(FormData.prototype, "append");

    await sendDictation(
      ENDPOINT,
      { blob: new Blob(["x"], { type: "audio/webm;codecs=opus" }) },
      {
        headers: () => ({ Authorization: "Bearer t" }),
      },
    );

    const init = fetchSpy.mock.calls[0]?.[1];
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer t");
    expect(append).toHaveBeenCalledWith("file", expect.any(Blob), "audio.webm");
  });

  it("uploads a native recording by its uri, the way React Native's FormData expects", async () => {
    mockFetchJson({ text: "From the phone." });
    const append = vi.spyOn(FormData.prototype, "append").mockImplementation(() => undefined);

    const result = await sendDictation(ENDPOINT, { uri: "file:///cache/dictation.wav", mimeType: "audio/wav" }, {});

    expect(append).toHaveBeenCalledWith("file", {
      uri: "file:///cache/dictation.wav",
      name: "audio.wav",
      type: "audio/wav",
    });
    expect(result).toEqual({ ok: true, text: "From the phone." });
  });

  it("keeps the words of a plain error body", async () => {
    mockFetchJson({ error: "Recording was empty" }, 400);

    const result = await sendDictation(ENDPOINT, { blob: new Blob(["x"]) }, {});

    expect(result).toEqual({ ok: false, errorCode: "TRANSCRIPTION_FAILED", message: "Recording was empty" });
  });
});
