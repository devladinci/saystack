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

  it("keeps showing what it showed while it leaves, then goes", () => {
    vi.useFakeTimers();
    const playing = fakeSpeech({ phase: "playing", chunks: CHUNKS, chunkIndex: 0 });
    const { container, rerender } = render(<SpeechPlayer speech={playing.result} />);

    expect(container.querySelector(".saystack-player-reveal")?.hasAttribute("data-leaving")).toBe(false);

    rerender(<SpeechPlayer speech={fakeSpeech({ phase: "idle" }).result} />);

    expect(container.querySelector(".saystack-player-reveal")?.hasAttribute("data-leaving")).toBe(true);
    expect(container.querySelector(".saystack-player")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".saystack-player__word--now")?.textContent).toBe("two");

    act(() => {
      vi.advanceTimersByTime(240);
    });

    expect(container.innerHTML).toBe("");
  });

  it("stays when reading starts again while it leaves", () => {
    vi.useFakeTimers();
    const playing = fakeSpeech({ phase: "playing", chunks: CHUNKS, chunkIndex: 0 });
    const { container, rerender } = render(<SpeechPlayer speech={playing.result} />);

    rerender(<SpeechPlayer speech={fakeSpeech({ phase: "idle" }).result} />);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender(<SpeechPlayer speech={fakeSpeech({ phase: "loading", chunks: CHUNKS, chunkIndex: -1 }).result} />);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(container.querySelector(".saystack-player-reveal")?.hasAttribute("data-leaving")).toBe(false);
    expect(container.querySelector(".saystack-player")?.hasAttribute("aria-hidden")).toBe(false);
    expect(screen.getByText("Preparing audio…")).toBeTruthy();
  });

  it("does not ask to be closed again while it leaves", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const done = fakeSpeech({ phase: "done", chunks: CHUNKS, chunkIndex: 1 });
    const { rerender } = render(<SpeechPlayer speech={done.result} autoHideMs={100} onClose={onClose} />);

    rerender(<SpeechPlayer speech={fakeSpeech({ phase: "idle" }).result} autoHideMs={100} onClose={onClose} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("marks itself while a status takes the place of the words", () => {
    const status = (state: Parameters<typeof fakeSpeech>[0]): boolean => {
      const { container, unmount } = render(<SpeechPlayer speech={fakeSpeech(state).result} />);
      const has = container.querySelector(".saystack-player")?.hasAttribute("data-status") === true;

      unmount();

      return has;
    };

    expect(status({ phase: "loading", chunks: CHUNKS, chunkIndex: -1 })).toBe(true);
    expect(status({ phase: "playing", chunks: CHUNKS, chunkIndex: 0 })).toBe(false);
    expect(status({ phase: "done", chunks: CHUNKS, chunkIndex: 1 })).toBe(true);
    expect(status({ phase: "error", chunks: CHUNKS, chunkIndex: 0 })).toBe(true);
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
