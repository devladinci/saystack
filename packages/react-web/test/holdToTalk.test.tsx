import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useHoldToTalk } from "../src/useHoldToTalk.js";
import type { IUseHoldToTalkOptions } from "../src/useHoldToTalk.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Mic(props: IUseHoldToTalkOptions) {
  const hold = useHoldToTalk(props);
  const state = hold.isCancelling ? "cancelling" : hold.isHolding ? "holding" : hold.isTooShort ? "too short" : "idle";

  return (
    <button type="button" {...hold.handlers}>
      {state}
    </button>
  );
}

const setup = (options: Partial<IUseHoldToTalkOptions> = {}) => {
  const calls: string[] = [];
  render(
    <Mic
      onStart={() => calls.push("start")}
      onEnd={() => calls.push("end")}
      onCancel={() => calls.push("cancel")}
      {...options}
    />,
  );
  const button = screen.getByRole("button");
  // happy-dom has no pointer capture; the hook only needs the call to exist.
  button.setPointerCapture = () => undefined;
  return { calls, button };
};

const down = (button: HTMLElement, x = 10, y = 10): void => {
  fireEvent.pointerDown(button, { pointerId: 1, button: 0, clientX: x, clientY: y });
};

describe("useHoldToTalk (web)", () => {
  it("a long enough hold starts, then ends on release", () => {
    vi.useFakeTimers();
    const { calls, button } = setup();

    down(button);
    expect(button.textContent).toBe("holding");
    act(() => {
      vi.advanceTimersByTime(600);
    });
    fireEvent.pointerUp(button, { pointerId: 1 });

    expect(calls).toEqual(["start", "end"]);
    expect(button.textContent).toBe("idle");
  });

  it("a tap is too short: cancelled, and says so for a moment", () => {
    vi.useFakeTimers();
    const { calls, button } = setup();

    down(button);
    fireEvent.pointerUp(button, { pointerId: 1 });

    expect(calls).toEqual(["start", "cancel"]);
    expect(button.textContent).toBe("too short");
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(button.textContent).toBe("idle");
  });

  it("dragging past the cancel distance cancels on release", () => {
    vi.useFakeTimers();
    const { calls, button } = setup({ cancelDistance: 50 });

    down(button, 10, 10);
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 10, clientY: 90 });
    expect(button.textContent).toBe("cancelling");
    act(() => {
      vi.advanceTimersByTime(600);
    });
    fireEvent.pointerUp(button, { pointerId: 1 });

    expect(calls).toEqual(["start", "cancel"]);
  });

  it("a browser-cancelled pointer cancels; a disabled button never starts", () => {
    const first = setup();
    down(first.button);
    fireEvent.pointerCancel(first.button, { pointerId: 1 });
    expect(first.calls).toEqual(["start", "cancel"]);
    cleanup();

    const second = setup({ isDisabled: true });
    down(second.button);
    fireEvent.pointerUp(second.button, { pointerId: 1 });
    expect(second.calls).toEqual([]);
  });
});
