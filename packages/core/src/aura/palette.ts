import type { AuraPaletteName } from "./style.js";

export type LinearRgb = readonly [number, number, number];

export interface IBandPalette {
  onDark: readonly LinearRgb[];
  onLight: readonly LinearRgb[];
  css: readonly string[];
  cssLight: readonly string[];
}

interface IPaletteSpec {
  from: number;
  span: number;
  chroma: number;
  wrap: boolean;
}

const SPECS: Readonly<Record<AuraPaletteName, IPaletteSpec>> = {
  prism: { from: 25, span: 360, chroma: 0.15, wrap: true },
  aurora: { from: 150, span: 160, chroma: 0.14, wrap: false },
  sunset: { from: 350, span: 100, chroma: 0.15, wrap: false },
  mono: { from: 0, span: 0, chroma: 0, wrap: false },
};

const DARK_LIGHTNESS = 0.78;

const LIGHT_LIGHTNESS = 0.6;

const LIGHT_EXTRA_CHROMA = 0.02;

function oklchToLinear(lightness: number, chroma: number, hueDegrees: number): [number, number, number] {
  const hue = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: readonly number[]): boolean => rgb.every((value) => value >= -1e-4 && value <= 1.0001);

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

function fitToGamut(lightness: number, chroma: number, hue: number): LinearRgb {
  const direct = oklchToLinear(lightness, chroma, hue);

  if (inGamut(direct)) {
    return [clampUnit(direct[0]), clampUnit(direct[1]), clampUnit(direct[2])];
  }

  let low = 0;
  let high = chroma;

  for (let step = 0; step < 18; step += 1) {
    const middle = (low + high) / 2;

    if (inGamut(oklchToLinear(lightness, middle, hue))) {
      low = middle;
    } else {
      high = middle;
    }
  }

  const fitted = oklchToLinear(lightness, low, hue);

  return [clampUnit(fitted[0]), clampUnit(fitted[1]), clampUnit(fitted[2])];
}

const encodeSrgb = (value: number): number => (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055);

const toCss = (rgb: LinearRgb): string => `rgb(${rgb.map((value) => Math.round(encodeSrgb(value) * 255)).join(" ")})`;

export function bandPalette(name: AuraPaletteName, count: number): IBandPalette {
  const spec = SPECS[name];
  const bands = Math.max(1, Math.round(count));
  const hues = Array.from({ length: bands }, (_, index) =>
    spec.wrap ? spec.from + (spec.span * index) / bands : spec.from + (spec.span * index) / Math.max(1, bands - 1),
  );
  const onDark = hues.map((hue) => fitToGamut(DARK_LIGHTNESS, spec.chroma, hue));
  const onLight = hues.map((hue) =>
    fitToGamut(LIGHT_LIGHTNESS, spec.chroma + LIGHT_EXTRA_CHROMA * Math.sign(spec.chroma), hue),
  );

  return { onDark, onLight, css: onDark.map(toCss), cssLight: onLight.map(toCss) };
}
