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
  view: "mobile",
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
      JSON.stringify({
        theme: "neon",
        source: 3,
        view: "tablet",
        dictation: { bands: 99, layout: "spiral", glow: 1 },
        extra: true,
      }),
    );

    expect(decodeSettings(hash)).toEqual({ ...DEFAULT_SETTINGS, dictation: { bands: 8 } });
    expect(decodeSettings("#not-json")).toEqual(DEFAULT_SETTINGS);
  });
});

describe("aura styles", () => {
  it("leave the library defaults alone until something is tuned", () => {
    expect(effectiveStyle("dictation", {}, "dark", "desktop")).toEqual(DEFAULT_AURA_STYLE);
    expect(effectiveStyle("readAloud", {}, "dark", "desktop")).toEqual(
      resolveAuraStyle(auraStyleFor(MESSAGE_AURA_STYLE, "dark")),
    );
  });

  it("read aloud on mobile with the wave from the top edge, as React Native does, not the glow around a reply", () => {
    expect(effectiveStyle("readAloud", {}, "dark", "mobile")).toEqual(DEFAULT_AURA_STYLE);
    expect(effectiveStyle("readAloud", { lineWidth: 3 }, "light", "mobile")).toEqual({
      ...DEFAULT_AURA_STYLE,
      lineWidth: 3,
    });
  });

  it("apply a tuned read-aloud value on both backgrounds, even where the default differs per background", () => {
    const options = readAloudStyleOptions({ lineWidth: 3 });

    expect(effectiveStyle("readAloud", { lineWidth: 3 }, "dark", "desktop").lineWidth).toBe(3);
    expect(effectiveStyle("readAloud", { lineWidth: 3 }, "light", "desktop").lineWidth).toBe(3);
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
    const snippet = configSnippet({ ...tuned, view: "desktop" });

    expect(snippet).toContain(
      'useDictationAura(composerRef, dictation, { style: { bands: 5, layout: "mirror", lineWidth: 2.4 } });',
    );
    expect(snippet).toContain("bands: 5 });");
    expect(snippet).toContain('palette: "sunset"');
    expect(snippet).toContain("dark: { lineWidth: 3,");
  });
});

describe("the copied config on mobile", () => {
  it("is React Native code with the spotlights' own defaults when nothing is tuned", () => {
    const snippet = configSnippet({ ...DEFAULT_SETTINGS, view: "mobile" });

    expect(snippet).toContain('from "@saystack/react-native";');
    expect(snippet).toContain("<DictationSpotlight dictation={dictation} hold={hold} theme={theme} />");
    expect(snippet).toContain("<ReadAloudSpotlight theme={theme} />");
    expect(snippet).not.toContain("@saystack/react-web");
  });

  it("carries every tuned value as the spotlights' aura style", () => {
    const snippet = configSnippet(tuned);

    expect(snippet).toContain('auraStyle={{ bands: 5, layout: "mirror", lineWidth: 2.4 }}');
    expect(snippet).toContain('<ReadAloudSpotlight theme={theme} auraStyle={{ lineWidth: 3, palette: "sunset" }} />');
    expect(snippet).toContain("useNativeDictation({ endpoint: `${API}/audio/transcriptions`, bands: 5,");
  });
});
