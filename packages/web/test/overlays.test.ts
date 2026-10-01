import { afterEach, describe, expect, it } from "vitest";

import { createAura } from "../src/aura/createAura.js";
import { createFieldInput } from "../src/fieldInput.js";
import { createSpectrumLine } from "../src/spectrumLine.js";
import { createStreamingInput } from "../src/streamingInput.js";

afterEach(() => {
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
    const field = document.createElement("textarea");
    field.value = "Note:";
    document.body.append(field);
    const values: string[] = [];
    const input = createFieldInput(field, { onValue: (value) => values.push(value) });

    input.show("buy");
    input.show("buy milk");
    input.end("Buy milk.");

    expect(values).toEqual(["Note: buy", "Note: buy milk", "Note: Buy milk."]);
    expect(document.querySelector(".saystack-streaming")).toBeNull();
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
