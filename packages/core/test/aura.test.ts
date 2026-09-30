import { describe, expect, it } from "vitest";

import { bandEdges, createBandMeter } from "../src/aura/bandMeter.js";
import { bandPalette } from "../src/aura/palette.js";
import { auraStyleFor, DEFAULT_AURA_STYLE, MESSAGE_AURA_STYLE, resolveAuraStyle } from "../src/aura/style.js";
import type { IAuraStyle } from "../src/aura/style.js";

describe("resolveAuraStyle", () => {
  it("starts from the default look", () => {
    expect(resolveAuraStyle()).toEqual({
      bands: 7,
      layout: "flow",
      palette: "prism",
      lift: 43,
      lineWidth: 1.8,
      blur: 0,
      aura: 0.75,
      auraSize: 12,
      brightness: 0.55,
      rippleSpeed: 0.35,
      resolution: 1,
      placement: "top",
      outline: "fade",
    });
  });

  it("clamps numbers, rounds bands and ignores unknown names", () => {
    const style = resolveAuraStyle({
      bands: 11.6,
      lift: -3,
      blur: 40,
      brightness: Number.NaN,
      layout: "zigzag" as IAuraStyle["layout"],
    });

    expect(style.bands).toBe(8);
    expect(style.lift).toBe(0);
    expect(style.blur).toBe(24);
    expect(style.brightness).toBe(DEFAULT_AURA_STYLE.brightness);
    expect(style.layout).toBe(DEFAULT_AURA_STYLE.layout);
  });
});

describe("auraStyleFor", () => {
  it("lays the background's changes over the shared look", () => {
    const style = { lift: 16, brightness: 0.5, dark: { brightness: 0.3, blur: 6 }, light: { blur: 2 } };

    expect(auraStyleFor(style, "dark")).toEqual({ lift: 16, brightness: 0.3, blur: 6 });
    expect(auraStyleFor(style, "light")).toEqual({ lift: 16, brightness: 0.5, blur: 2 });
    expect(auraStyleFor({ lift: 9 }, "dark")).toEqual({ lift: 9 });
  });

  it("keeps the message look soft, and quieter on dark backgrounds where light adds up", () => {
    const dark = resolveAuraStyle(auraStyleFor(MESSAGE_AURA_STYLE, "dark"));
    const light = resolveAuraStyle(auraStyleFor(MESSAGE_AURA_STYLE, "light"));

    expect(dark.outline).toBe("full");
    expect(dark.blur).toBeGreaterThan(light.blur);
    expect(light.blur).toBeGreaterThan(0);
    expect(dark.brightness).toBeLessThan(light.brightness);
  });
});

describe("bandPalette", () => {
  it("gives one color per band in every form", () => {
    const palette = bandPalette("prism", 6);

    expect(palette.onDark).toHaveLength(6);
    expect(palette.onLight).toHaveLength(6);
    expect(palette.css.every((color) => /^rgb\(\d+ \d+ \d+\)$/.test(color))).toBe(true);
  });

  it("balances the prism so the bands add up close to white", () => {
    const { onDark } = bandPalette("prism", 7);
    const sums = [0, 1, 2].map((channel) => onDark.reduce((sum, color) => sum + (color[channel] ?? 0), 0));

    expect(Math.max(...sums) / Math.min(...sums)).toBeLessThan(1.3);
  });

  it("keeps mono neutral", () => {
    const { onDark } = bandPalette("mono", 3);

    expect(onDark.every(([r, g, b]) => Math.abs(r - g) < 1e-9 && Math.abs(g - b) < 1e-9)).toBe(true);
  });
});

describe("bandEdges", () => {
  it("splits the voice range on a log scale", () => {
    const edges = bandEdges(6);

    expect(edges).toHaveLength(7);
    expect(edges[0]).toBe(80);
    expect(edges[6]).toBeCloseTo(8000, 6);
    expect((edges[1] ?? 0) / (edges[0] ?? 1)).toBeCloseTo((edges[6] ?? 0) / (edges[5] ?? 1), 6);
  });
});

describe("createBandMeter", () => {
  const SAMPLE_RATE = 48000;
  const BINS = 1024;
  const binHz = SAMPLE_RATE / (BINS * 2);

  const spectrumWith = (loudFromHz: number, loudToHz: number): Float32Array => {
    const spectrum = new Float32Array(BINS).fill(-100);

    for (let bin = 0; bin < BINS; bin += 1) {
      const hz = bin * binHz;

      if (hz >= loudFromHz && hz < loudToHz) {
        spectrum[bin] = -30;
      }
    }

    return spectrum;
  };

  it("lights the band that carries the energy and keeps the others low", () => {
    const meter = createBandMeter({ bands: 6, sampleRate: SAMPLE_RATE, binCount: BINS });
    const edges = bandEdges(6);
    const quiet = new Float32Array(BINS).fill(-100);

    meter.update(quiet, 1 / 60);

    for (let frame = 0; frame < 30; frame += 1) {
      meter.update(spectrumWith(edges[2] ?? 0, edges[3] ?? 0), 1 / 60);
    }

    const levels = Array.from(meter.levels);
    const loudest = levels.indexOf(Math.max(...levels));

    expect(loudest).toBe(2);
    expect(levels[2]).toBeGreaterThan(0.5);
    expect(levels[0]).toBeLessThan(0.2);
  });

  it("learns steady room noise and ignores it", () => {
    const meter = createBandMeter({ bands: 6, sampleRate: SAMPLE_RATE, binCount: BINS });
    const noise = (): Float32Array => Float32Array.from({ length: BINS }, () => -60 + (Math.random() - 0.5) * 4);

    for (let frame = 0; frame < 6; frame += 1) {
      meter.update(new Float32Array(BINS).fill(-Infinity), 1 / 60);
    }

    for (let frame = 0; frame < 120; frame += 1) {
      meter.update(noise(), 1 / 60);
    }

    expect(Math.max(...meter.levels)).toBeLessThan(0.2);

    const edges = bandEdges(6);
    const speech = noise();

    for (let bin = 0; bin < BINS; bin += 1) {
      const hz = bin * binHz;

      if (hz >= (edges[1] ?? 0) && hz < (edges[2] ?? 0)) {
        speech[bin] = -25;
      }
    }

    for (let frame = 0; frame < 10; frame += 1) {
      meter.update(speech, 1 / 60);
    }

    expect(meter.levels[1]).toBeGreaterThan(0.5);
  });

  it("stays dark on silence", () => {
    const meter = createBandMeter({ bands: 6, sampleRate: SAMPLE_RATE, binCount: BINS });

    for (let frame = 0; frame < 30; frame += 1) {
      meter.update(new Float32Array(BINS).fill(-Infinity), 1 / 60);
    }

    expect(Array.from(meter.levels).every((level) => level === 0)).toBe(true);
  });
});
