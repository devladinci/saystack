import { afterEach, describe, expect, it, vi } from "vitest";

import { createAura } from "../src/aura/createAura.js";
import { createFieldInput } from "../src/fieldInput.js";
import { createSpectrumLine } from "../src/spectrumLine.js";
import { createStreamingInput } from "../src/streamingInput.js";

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("createStreamingInput", () => {
  it("shows final and interim words over the field and returns the full text", () => {
    const field = document.createElement("textarea");
    field.value = "Note:";
    document.body.append(field);
    const streaming = createStreamingInput(field);

    streaming.begin();
    const text = streaming.update("read your", "last");
    const words = Array.from(document.querySelectorAll(".saystack-streaming-word"), (word) => [
      word.textContent,
      word.classList.contains("saystack-streaming-interim"),
    ]);

    expect(text).toBe("Note: read your last");
    expect(words).toEqual([
      ["read", false],
      ["your", false],
      ["last", true],
    ]);
    expect(field.style.color).toBe("transparent");
  });

  it("gives the text back and restores the field when it ends", () => {
    const field = document.createElement("textarea");
    field.style.color = "red";
    document.body.append(field);
    const streaming = createStreamingInput(field);

    streaming.begin();
    streaming.update("hello there", "");

    expect(streaming.end()).toBe("hello there");
    expect(field.style.color).toBe("red");
    expect(document.querySelector(".saystack-streaming")).toBeNull();
  });

  it("shows every word as unsettled while the final text is awaited", () => {
    const field = document.createElement("textarea");
    document.body.append(field);
    const streaming = createStreamingInput(field);

    streaming.begin();
    streaming.update("review the peer", "");
    streaming.hold();
    const held = Array.from(document.querySelectorAll(".saystack-streaming-word"), (word) =>
      word.classList.contains("saystack-streaming-interim"),
    );
    streaming.update("Review the PR.", "");
    const settled = Array.from(document.querySelectorAll(".saystack-streaming-word"), (word) =>
      word.classList.contains("saystack-streaming-interim"),
    );

    expect(held).toEqual([true, true, true]);
    expect(settled).toEqual([false, false, false]);
  });

  it("keeps the words up until a changed final text has finished arriving, then restores the field", () => {
    vi.useFakeTimers();
    const field = document.createElement("textarea");
    field.style.color = "red";
    document.body.append(field);
    const streaming = createStreamingInput(field);

    streaming.begin();
    streaming.update("review the peer", "");
    vi.advanceTimersByTime(2000);
    streaming.update("Review the PR.", "");

    expect(streaming.settle()).toBe("Review the PR.");
    expect(document.querySelector(".saystack-streaming-settling")).not.toBeNull();
    expect(field.style.color).toBe("transparent");

    vi.advanceTimersByTime(600);

    expect(document.querySelector(".saystack-streaming")).toBeNull();
    expect(field.style.color).toBe("red");
  });

  it("settles at once when no word changed, when the user types, and when dictation starts again", () => {
    vi.useFakeTimers();
    const field = document.createElement("textarea");
    document.body.append(field);
    const streaming = createStreamingInput(field);

    streaming.begin();
    streaming.update("hello there", "");
    vi.advanceTimersByTime(2000);
    streaming.settle();
    const afterUnchanged = document.querySelector(".saystack-streaming");

    streaming.begin();
    streaming.update("new words", "");
    streaming.settle();
    field.dispatchEvent(new Event("input"));
    const afterTyping = document.querySelector(".saystack-streaming");

    streaming.begin();
    streaming.update("more words", "");
    streaming.settle();
    streaming.begin();
    streaming.update("again", "");
    const words = Array.from(document.querySelectorAll(".saystack-streaming-word"), (word) => word.textContent);

    expect(afterUnchanged).toBeNull();
    expect(afterTyping).toBeNull();
    expect(words).toEqual(["again"]);
  });

  it("keeps the newest words in view in a field too small for them", () => {
    const field = document.createElement("textarea");
    Object.defineProperty(field, "scrollHeight", { value: 240, configurable: true });
    document.body.append(field);
    const streaming = createStreamingInput(field);

    streaming.begin();
    streaming.update("a dictation longer than the field", "");

    expect(field.scrollTop).toBe(240);
    expect(document.querySelector(".saystack-streaming")?.scrollTop).toBe(240);
  });

  it("leaves a field alone that hides its overflow, since its host grows it to fit", () => {
    const field = document.createElement("textarea");
    field.style.overflowY = "hidden";
    Object.defineProperty(field, "scrollHeight", { value: 240, configurable: true });
    document.body.append(field);
    const streaming = createStreamingInput(field);

    streaming.begin();
    streaming.update("a dictation the field is growing for", "");

    expect(field.scrollTop).toBe(0);
    expect(document.querySelector(".saystack-streaming")?.scrollTop).toBe(0);
  });

  it("keeps the end of a single line in view", () => {
    const field = document.createElement("input");
    Object.defineProperty(field, "scrollWidth", { value: 900, configurable: true });
    document.body.append(field);
    const streaming = createStreamingInput(field);

    streaming.begin();
    streaming.update("a dictation wider than the field", "");

    expect(field.scrollLeft).toBe(900);
  });

  it("stays over a field that changes size, without waiting for the next frame", () => {
    let resize: () => void = () => undefined;

    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resize = callback;
        }

        observe(): void {}

        disconnect(): void {}
      },
    );

    const field = document.createElement("textarea");
    const box = vi.spyOn(field, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 500, 300, 36));
    document.body.append(field);
    const streaming = createStreamingInput(field);

    streaming.begin();
    streaming.update("hello", "");
    box.mockReturnValue(new DOMRect(10, 476, 300, 60));
    resize();

    const mirror = document.querySelector<HTMLElement>(".saystack-streaming");

    expect(mirror?.style.height).toBe("60px");
    expect(mirror?.style.transform).toBe("translate(10px, 476px)");

    vi.unstubAllGlobals();
  });

  it("returns what was typed before when cancelled", () => {
    const field = document.createElement("textarea");
    field.value = "typed";
    document.body.append(field);
    const streaming = createStreamingInput(field);

    streaming.begin();
    streaming.update("spoken words", "");

    expect(streaming.cancel()).toBe("typed");
  });
});

describe("createFieldInput", () => {
  it("streams the words after what was typed and hands the value back", () => {
    vi.useFakeTimers();
    const field = document.createElement("textarea");
    field.value = "Note:";
    document.body.append(field);
    const values: string[] = [];
    const input = createFieldInput(field, { onValue: (value) => values.push(value) });

    input.show("buy");
    input.show("buy milk");
    input.end("Buy milk.");

    expect(values).toEqual(["Note: buy", "Note: buy milk", "Note: Buy milk."]);

    vi.advanceTimersByTime(600);

    expect(document.querySelector(".saystack-streaming")).toBeNull();
  });

  it("marks the streamed words as unsettled while it waits, and does nothing when none were streamed", () => {
    const field = document.createElement("textarea");
    document.body.append(field);
    const input = createFieldInput(field, { onValue: () => undefined });

    input.wait?.();
    const before = document.querySelector(".saystack-streaming");
    input.show("review the peer");
    input.wait?.();

    expect(before).toBeNull();
    expect(document.querySelectorAll(".saystack-streaming-interim")).toHaveLength(3);
  });

  it("gives back what was typed when the dictation is dropped", () => {
    const field = document.createElement("textarea");
    field.value = "typed";
    document.body.append(field);
    const values: string[] = [];
    const input = createFieldInput(field, { onValue: (value) => values.push(value) });

    input.show("spoken");
    input.end(null);

    expect(values).toEqual(["typed spoken", "typed"]);
  });

  it("writes a dictation that never streamed straight into the field", () => {
    const field = document.createElement("input");
    field.value = "Hi";
    document.body.append(field);
    const values: string[] = [];

    createFieldInput(field, { onValue: (value) => values.push(value) }).end("there");

    expect(values).toEqual(["Hi there"]);
  });
});

describe("createAura", () => {
  it("does nothing, quietly, where WebGL is missing", () => {
    const aura = createAura({ anchor: document.body });

    aura.setState("active");
    aura.update({ style: { bands: 5 } });
    aura.setAnchor(null);

    expect(aura.state).toBe("active");
    expect(document.querySelector(".saystack-aura")).toBeNull();
    expect(() => aura.destroy()).not.toThrow();
  });
});

describe("createSpectrumLine", () => {
  it("survives a canvas without a 2D context", () => {
    const line = createSpectrumLine(document.createElement("canvas"), { levels: () => [0.5, 0.5] });

    line.setState("live");
    line.update({ style: { bands: 6 } });

    expect(() => line.destroy()).not.toThrow();
  });
});
