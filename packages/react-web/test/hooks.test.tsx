import type { IAudioLevels } from "@saystack/web";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAudioLevels } from "../src/useAudioLevels.js";
import { useAura } from "../src/useAura.js";
import { useFieldInput } from "../src/useFieldInput.js";
import { useReadAlong } from "../src/useReadAlong.js";
import { useRecorderLevels } from "../src/useRecorderLevels.js";
import { useStreamingInput } from "../src/useStreamingInput.js";
import { useWordReveal } from "../src/useWordReveal.js";
import { chunk, fakeSpeech } from "./fakeSpeech.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useWordReveal", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  });

  it("lets a finished transcript appear word by word", () => {
    const { result } = renderHook(() => useWordReveal("one two three four five", 10));

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(result.current.isRevealing).toBe(true);
    expect(result.current.interimText.length).toBeGreaterThan(0);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current).toEqual({ finalText: "one two three four five", interimText: "", isRevealing: false });
  });
});

interface IFieldProps {
  isStreaming: boolean;
  finalText: string;
  interimText: string;
  onText: (text: string) => void;
}

function Field({ isStreaming, finalText, interimText, onText }: IFieldProps) {
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  useStreamingInput(fieldRef, { isStreaming, finalText, interimText, onText });

  return <textarea ref={fieldRef} defaultValue="Hi," />;
}

describe("useStreamingInput", () => {
  it("streams words over the field and hands back the text", () => {
    const onText = vi.fn();
    const { rerender } = render(<Field isStreaming={true} finalText="" interimText="" onText={onText} />);

    rerender(<Field isStreaming={true} finalText="read this" interimText="now" onText={onText} />);

    expect(onText).toHaveBeenLastCalledWith("Hi, read this now");
    expect(document.querySelectorAll(".saystack-streaming-word")).toHaveLength(3);

    rerender(<Field isStreaming={false} finalText="read this now" interimText="" onText={onText} />);

    expect(onText).toHaveBeenLastCalledWith("Hi, read this now");
    expect(document.querySelector(".saystack-streaming")).toBeNull();
  });
});

describe("useStreamingInput — hand-over", () => {
  it("keeps the last words when streaming ends in the same render they arrive", () => {
    const onText = vi.fn();
    const { rerender } = render(<Field isStreaming={true} finalText="book a table" interimText="" onText={onText} />);

    rerender(<Field isStreaming={false} finalText="book a table for two" interimText="" onText={onText} />);

    expect(onText).toHaveBeenLastCalledWith("Hi, book a table for two");
  });

  it("keeps earlier words when a new dictation starts while still streaming", () => {
    const onText = vi.fn();
    const { rerender } = render(<Field isStreaming={true} finalText="first part" interimText="" onText={onText} />);

    rerender(<Field isStreaming={true} finalText="" interimText="" onText={onText} />);
    rerender(<Field isStreaming={true} finalText="second part" interimText="" onText={onText} />);

    expect(onText).toHaveBeenLastCalledWith("Hi, first part second part");
  });
});

class FakeHighlight extends Set<Range> {}

interface IMessageProps {
  isActive: boolean;
}

describe("useReadAlong", () => {
  it("highlights the message being read", () => {
    const registry = new Map<string, FakeHighlight>();
    vi.stubGlobal("Highlight", FakeHighlight);
    vi.stubGlobal("CSS", { highlights: registry });
    const { result: speech } = fakeSpeech(
      { phase: "paused", chunks: [chunk("Read me out loud.")], chunkIndex: 0 },
      { chunkIndex: 0, time: 1, duration: 2, wordIndex: 2 },
    );

    function Message({ isActive }: IMessageProps) {
      const rootRef = useRef<HTMLDivElement>(null);

      useReadAlong(rootRef, speech, { isActive });

      return (
        <div ref={rootRef}>
          <p>Read me out loud.</p>
        </div>
      );
    }

    const { rerender } = render(<Message isActive={true} />);
    const read = Array.from(registry.get("saystack-read") ?? [], (range) => range.toString());

    expect(read).toEqual(["Read", "me"]);

    rerender(<Message isActive={false} />);

    expect(registry.has("saystack-read")).toBe(false);
  });
});

describe("useAudioLevels", () => {
  it("measures nothing where Web Audio is missing", () => {
    vi.stubGlobal("AudioContext", undefined);

    const { result } = renderHook(() => useAudioLevels());

    expect(result.current).toBeNull();
  });
});

interface IRecordingProps {
  isRecording: boolean;
}

describe("useRecorderLevels", () => {
  it("listens to the app's own recording once its microphone opens", () => {
    vi.useFakeTimers();
    const disconnect = vi.fn();
    const listen = vi.fn(() => disconnect);
    const levels = { listen, reset: vi.fn() } as unknown as IAudioLevels;
    const stream = {} as MediaStream;
    let live: MediaStream | null = null;

    const { rerender } = renderHook(
      ({ isRecording }: IRecordingProps) => useRecorderLevels(levels, isRecording, () => live),
      {
        initialProps: { isRecording: true },
      },
    );

    expect(listen).not.toHaveBeenCalled();

    live = stream;
    act(() => {
      vi.advanceTimersByTime(60);
    });

    expect(listen).toHaveBeenCalledOnce();
    expect(listen).toHaveBeenCalledWith(stream);

    rerender({ isRecording: false });

    expect(disconnect).toHaveBeenCalledOnce();
  });
});

describe("useAura", () => {
  it("renders without WebGL and cleans up", () => {
    function Anchor() {
      const anchorRef = useRef<HTMLDivElement>(null);

      useAura(anchorRef, { state: "active", style: { bands: 5 } });

      return <div ref={anchorRef} />;
    }

    const { unmount } = render(<Anchor />);

    expect(() => unmount()).not.toThrow();
  });
});

describe("useFieldInput", () => {
  it("streams dictated words into the field it points at and hands the value back", () => {
    const values: string[] = [];
    const { result } = renderHook(() => {
      const fieldRef = useRef<HTMLTextAreaElement | null>(null);
      const input = useFieldInput(fieldRef, (value) => values.push(value));

      return { fieldRef, input };
    });
    const field = document.createElement("textarea");
    field.value = "Hi";
    document.body.append(field);
    result.current.fieldRef.current = field;

    result.current.input.show("there");
    result.current.input.end("there!");

    expect(values).toEqual(["Hi there", "Hi there!"]);
  });

  it("does nothing while the field is not mounted", () => {
    const values: string[] = [];
    const { result } = renderHook(() => useFieldInput(useRef(null), (value) => values.push(value)));

    result.current.show("lost");
    result.current.end("lost");

    expect(values).toEqual([]);
  });
});
