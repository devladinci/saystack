import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IPcmSource } from "../src/liveTranscription.js";
import { startLiveTranscription } from "../src/liveTranscription.js";
import { FakeSocket } from "./fakeSocket.js";

interface IFakeSource extends IPcmSource {
  speak: (bytes: number) => void;
  stops: number;
}

const fakeSource = (): IFakeSource => {
  let deliver: ((pcm: Uint8Array<ArrayBuffer>) => void) | null = null;
  const source: IFakeSource = {
    stops: 0,
    start: (onChunk) => {
      deliver = onChunk;

      return () => {
        deliver = null;
        source.stops += 1;
      };
    },
    speak: (bytes) => deliver?.(new Uint8Array(bytes)),
  };

  return source;
};

beforeEach(() => {
  vi.stubGlobal("WebSocket", FakeSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  FakeSocket.last = null;
});

const start = () => {
  const source = fakeSource();
  const heard: string[] = [];
  const live = startLiveTranscription({
    url: "ws://daemon/stt/stream",
    source,
    onText: (text) => heard.push(text),
    onReady: () => heard.push("<ready>"),
  });
  const socket = FakeSocket.last;

  if (socket === null) {
    throw new Error("no socket");
  }

  return { live, source, socket, heard };
};

describe("startLiveTranscription", () => {
  it("opens with the language and the conversation's context, and leaves a blank context out", () => {
    startLiveTranscription({
      url: "ws://daemon/stt/stream",
      source: fakeSource(),
      onText: () => undefined,
      language: "en",
      context: "user: I opened PR 42",
      params: { model: "m" },
    });
    FakeSocket.last?.open();
    const withContext = FakeSocket.last?.texts();

    startLiveTranscription({
      url: "ws://daemon/stt/stream",
      source: fakeSource(),
      onText: () => undefined,
      context: " ",
    });
    FakeSocket.last?.open();

    expect(withContext).toEqual([{ model: "m", type: "start", language: "en", context: "user: I opened PR 42" }]);
    expect(FakeSocket.last?.texts()).toEqual([{ type: "start" }]);
  });

  it("streams any PCM source once the engine is ready", async () => {
    const { live, source, socket, heard } = start();

    socket.open();
    source.speak(3200);
    socket.reply({ type: "ready" });
    source.speak(1600);
    socket.reply({ type: "transcript.delta", delta: " On the" });
    socket.reply({ type: "transcript.delta", delta: " phone." });
    const finished = live.finish();
    socket.reply({ type: "transcript.done", text: "On the phone." });

    expect(socket.texts()).toEqual([{ type: "start" }, { type: "stop", waitMs: 8000 }]);
    expect(socket.audio().map((pcm) => pcm.byteLength)).toEqual([3200, 1600]);
    expect(heard).toEqual(["<ready>", "On the", "On the phone."]);
    await expect(finished).resolves.toBe("On the phone.");
    expect(source.stops).toBe(1);
  });

  it("stops the source when the connection fails", async () => {
    const { live, source, socket } = start();

    socket.close();

    await expect(live.finish()).resolves.toBeNull();
    expect(source.stops).toBe(1);
  });
});
