import { auraStyleFor, DEFAULT_AURA_STYLE, MESSAGE_AURA_STYLE, resolveAuraStyle } from "@saystack/core";
import { describe, expect, it } from "vitest";

import type { ISettings } from "../src/settings.js";
import {
  configSnippet,
  decodeSettings,
  DEFAULT_SETTINGS,
  effectiveStyle,
  encodeSettings,
  readAloudStyleOptions,
} from "../src/settings.js";

const tuned: ISettings = {
  ...DEFAULT_SETTINGS,
  theme: "light",
  dictation: { bands: 5, layout: "mirror", lineWidth: 2.4 },
  readAloud: { lineWidth: 3, palette: "sunset" },
  source: "mic",
  readAloudAnchor: "chat",
};

describe("share links", () => {
  it("bring back the same settings", () => {
    expect(decodeSettings(encodeSettings(tuned))).toEqual(tuned);
  });

  it("are empty for the defaults", () => {
    expect(encodeSettings(DEFAULT_SETTINGS)).toBe("");
    expect(decodeSettings("")).toEqual(DEFAULT_SETTINGS);
  });

  it("fall back to the defaults for anything they do not know", () => {
    const hash = encodeURIComponent(
      JSON.stringify({ theme: "neon", source: 3, dictation: { bands: 99, layout: "spiral", glow: 1 }, extra: true }),
    );

    expect(decodeSettings(hash)).toEqual({ ...DEFAULT_SETTINGS, dictation: { bands: 8 } });
    expect(decodeSettings("#not-json")).toEqual(DEFAULT_SETTINGS);
  });
});

describe("aura styles", () => {
  it("leave the library defaults alone until something is tuned", () => {
    expect(effectiveStyle("dictation", {}, "dark")).toEqual(DEFAULT_AURA_STYLE);
    expect(effectiveStyle("readAloud", {}, "dark")).toEqual(resolveAuraStyle(auraStyleFor(MESSAGE_AURA_STYLE, "dark")));
  });

  it("apply a tuned read-aloud value on both backgrounds, even where the default differs per background", () => {
    const options = readAloudStyleOptions({ lineWidth: 3 });

    expect(effectiveStyle("readAloud", { lineWidth: 3 }, "dark").lineWidth).toBe(3);
    expect(effectiveStyle("readAloud", { lineWidth: 3 }, "light").lineWidth).toBe(3);
    expect(options.dark?.lineWidth).toBe(3);
    expect(options.light?.lineWidth).toBe(3);
  });
});

describe("the copied config", () => {
  it("uses the library defaults when nothing is tuned", () => {
    const snippet = configSnippet(DEFAULT_SETTINGS);

    expect(snippet).toContain("useDictationAura(composerRef, dictation);");
    expect(snippet).toContain("<ReadAloudAura />");
  });

  it("carries every tuned value", () => {
    const snippet = configSnippet(tuned);

    expect(snippet).toContain(
      'useDictationAura(composerRef, dictation, { style: { bands: 5, layout: "mirror", lineWidth: 2.4 } });',
    );
    expect(snippet).toContain("bands: 5 });");
    expect(snippet).toContain('palette: "sunset"');
    expect(snippet).toContain("dark: { lineWidth: 3,");
  });
});
