import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SpeechPlayer from "../src/SpeechPlayer/index.js";
import { chunk, fakeSpeech } from "./fakeSpeech.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const CHUNKS = [chunk("One two three."), chunk("Four five six.")];

describe("SpeechPlayer", () => {
  it("stays out of the way while nothing is being read", () => {
    const { result } = fakeSpeech({ phase: "idle" });
    const { container } = render(<SpeechPlayer speech={result} />);

    expect(container.innerHTML).toBe("");
  });

  it("says it is preparing, and stops when asked", () => {
    const { result, api } = fakeSpeech({ phase: "loading", chunks: CHUNKS, chunkIndex: -1 });
    render(<SpeechPlayer speech={result} />);

    expect(screen.getByText("Preparing audio…")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    expect(api.stop).toHaveBeenCalledOnce();
  });

  it("shows the words of the part being read and marks the current one", () => {
    const { result, api } = fakeSpeech({ phase: "playing", chunks: CHUNKS, chunkIndex: 0 });
    render(<SpeechPlayer speech={result} />);

    expect(screen.getByText("two").classList.contains("saystack-player__word--now")).toBe(true);
    expect(screen.getByText("One").classList.contains("saystack-player__word--read")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));

    expect(api.pause).toHaveBeenCalledOnce();
  });

  it("resumes when paused", () => {
    const { result, api } = fakeSpeech({ phase: "paused", chunks: CHUNKS, chunkIndex: 0 });
    render(<SpeechPlayer speech={result} />);

    fireEvent.click(screen.getByRole("button", { name: "Resume" }));

    expect(api.resume).toHaveBeenCalledOnce();
  });

  it("skips between parts", () => {
    const { result, api } = fakeSpeech({ phase: "playing", chunks: CHUNKS, chunkIndex: 0 });
    render(<SpeechPlayer speech={result} />);

    fireEvent.click(screen.getByRole("button", { name: "Next part" }));
    fireEvent.click(screen.getByRole("button", { name: "Part 2 of 2" }));

    expect(api.seek).toHaveBeenNthCalledWith(1, 1);
    expect(api.seek).toHaveBeenNthCalledWith(2, 1);
    expect((screen.getByRole("button", { name: "Previous part" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("restarts the current part when previous is pressed a moment in", () => {
    const { result, api } = fakeSpeech(
      { phase: "playing", chunks: CHUNKS, chunkIndex: 1 },
      { chunkIndex: 1, time: 1.8, duration: 2, wordIndex: 2 },
    );
    render(<SpeechPlayer speech={result} />);

    fireEvent.click(screen.getByRole("button", { name: "Previous part" }));

    expect(api.seek).toHaveBeenCalledWith(1);
  });

  it("offers a replay when finished and hides itself later", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { result, api } = fakeSpeech({ phase: "done", chunks: CHUNKS, chunkIndex: 1 });
    render(<SpeechPlayer speech={result} onClose={onClose} />);

    expect(screen.getByText("Finished · 0:04")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Replay" }));

    expect(api.replay).toHaveBeenCalledOnce();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("explains an error and lets you retry", () => {
    const { result, api } = fakeSpeech({ phase: "error", errorCode: "TTS_TIMEOUT", chunks: CHUNKS, chunkIndex: 0 });
    render(<SpeechPlayer speech={result} />);

    expect(screen.getByText("The speech engine took too long.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(api.replay).toHaveBeenCalledOnce();
  });

  it("speaks the app's language", () => {
    const { result } = fakeSpeech({ phase: "loading", chunks: CHUNKS, chunkIndex: -1 });
    render(<SpeechPlayer speech={result} labels={{ preparing: "Подготвям звука…", stop: "Спри" }} />);

    expect(screen.getByText("Подготвям звука…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Спри" })).toBeTruthy();
  });

  it("offers to show the current word only when the app can", () => {
    const onLocate = vi.fn();
    const { result } = fakeSpeech({ phase: "playing", chunks: CHUNKS, chunkIndex: 0 });
    render(<SpeechPlayer speech={result} onLocate={onLocate} />);

    fireEvent.click(screen.getByRole("button", { name: "Show the current word" }));

    expect(onLocate).toHaveBeenCalledOnce();
  });
});
