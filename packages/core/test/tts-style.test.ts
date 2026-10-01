import { describe, expect, it } from "vitest";

import type { IStyleMap } from "../src/tts/style.js";
import { applyStyle, EMPTY_STYLE_MAP, matchStyle, styleChoices, styleReserve } from "../src/tts/style.js";

const MAP: IStyleMap = {
  channel: { mode: "field", field: "emotions" },
  rules: [{ value: "calm" }, { value: "amusement", label: "amused" }, { value: "whispering" }],
};

describe("matchStyle", () => {
  it("matches case-insensitively on the value the app sends", () => {
    expect(matchStyle(MAP, "Calm")?.value).toBe("calm");
  });

  it("matches against the label the model was offered", () => {
    expect(matchStyle(MAP, "amused")?.value).toBe("amusement");
  });

  it("returns undefined for a style nobody declared", () => {
    expect(matchStyle(MAP, "sexy")).toBeUndefined();
    expect(matchStyle(MAP, "<|emotion:anger|>")).toBeUndefined();
    expect(matchStyle(MAP, undefined)).toBeUndefined();
  });

  it("a null or non-string style — a nullable field in a model's JSON — is not a style", () => {
    expect(matchStyle(MAP, null)).toBeUndefined();
    expect(matchStyle(MAP, 7)).toBeUndefined();
    expect(matchStyle(MAP, {})).toBeUndefined();
    expect(matchStyle(MAP, "")).toBeUndefined();
  });

  it("an empty map never matches", () => {
    expect(matchStyle(EMPTY_STYLE_MAP, "calm")).toBeUndefined();
  });
});

describe("styleChoices", () => {
  it("offers the label when there is one, the value otherwise", () => {
    expect(styleChoices(MAP)).toEqual(["calm", "amused", "whispering"]);
  });

  it("no rules, no choices", () => {
    expect(styleChoices(EMPTY_STYLE_MAP)).toEqual([]);
  });
});

describe("applyStyle — channel none", () => {
  it("hands back the text untouched and no fields", () => {
    const styled = applyStyle({ mode: "none" }, "calm", "Hi.");

    expect(styled).toEqual({ text: "Hi.", fields: {}, prefixLength: 0 });
  });
});

describe("applyStyle — channel field", () => {
  it("puts the value in the declared field, text untouched", () => {
    expect(applyStyle({ mode: "field", field: "instructions" }, "calm", "Hi.")).toEqual({
      text: "Hi.",
      fields: { instructions: "calm" },
      prefixLength: 0,
    });
  });

  it("no value, no field", () => {
    expect(applyStyle({ mode: "field", field: "instructions" }, undefined, "Hi.")).toEqual({
      text: "Hi.",
      fields: {},
      prefixLength: 0,
    });
  });

  it("a blank field name degrades instead of guessing one", () => {
    expect(applyStyle({ mode: "field", field: "  " }, "calm", "Hi.")).toEqual({
      text: "Hi.",
      fields: {},
      prefixLength: 0,
    });
  });
});

describe("applyStyle — channel tag", () => {
  const TAG = { mode: "tag", template: "<|emotion:{style}|>" } as const;

  it("prefixes the text with the tag", () => {
    expect(applyStyle(TAG, "amusement", "Hi.").text).toBe("<|emotion:amusement|>Hi.");
  });

  it("tags carry no fields", () => {
    expect(applyStyle(TAG, "amusement", "Hi.").fields).toEqual({});
  });

  it("a template without the slot degrades instead of dropping the style silently", () => {
    expect(applyStyle({ mode: "tag", template: "oops" }, "amusement", "Hi.")).toEqual({
      text: "Hi.",
      fields: {},
      prefixLength: 0,
    });
  });

  it("a $ in a style value is inserted as written, not read as replacement syntax", () => {
    expect(applyStyle(TAG, "$&", "Hi.").text).toBe("<|emotion:$&|>Hi.");
    expect(applyStyle(TAG, "$$cheerful", "Hi.").text).toBe("<|emotion:$$cheerful|>Hi.");
  });

  it("reports how many characters the tag added in front of the text", () => {
    expect(applyStyle(TAG, "amusement", "Hi.").prefixLength).toBe(21);
    expect(applyStyle(TAG, undefined, "Hi.").prefixLength).toBe(0);
  });
});

describe("styleReserve — room a channel needs in front of a chunk", () => {
  it("counts the template's own characters plus the longest value it can fill", () => {
    expect(styleReserve(MAP)).toBe(0);
    // 12 characters of template around a 7-character slot, plus a 9-character value.
    expect(
      styleReserve({ channel: { mode: "tag", template: "<|emotion:{style}|>" }, rules: [{ value: "amusement" }] }),
    ).toBe(21);
  });

  it("a template without the slot costs the text nothing", () => {
    expect(styleReserve({ channel: { mode: "tag", template: "oops" }, rules: [] })).toBe(0);
  });

  it("a field channel costs the text nothing", () => {
    expect(styleReserve({ channel: { mode: "field", field: "instructions" }, rules: [{ value: "calm" }] })).toBe(0);
    expect(styleReserve(EMPTY_STYLE_MAP)).toBe(0);
  });
});
