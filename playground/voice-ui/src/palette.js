// Band colors, evenly spaced around the OKLCH hue circle at one lightness and
// chroma, so no band is louder than another. On dark backgrounds the lines
// add up like light: every band on top of each other makes white. On light
// backgrounds they average like paint and make a neutral grey.

export const PALETTES = ["prism", "aurora", "sunset", "mono"];

const SPECS = {
  prism: { from: 25, span: 360, wrap: true, chroma: 0.15 },
  aurora: { from: 150, span: 160, chroma: 0.14 },
  sunset: { from: 350, span: 100, chroma: 0.15 },
  mono: { from: 0, span: 0, chroma: 0 },
};

function oklchToLinear(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inside = (rgb) => rgb.every((v) => v >= -1e-4 && v <= 1.0001);

// Lowers chroma until the color fits in sRGB, keeping lightness and hue.
function fit(L, C, h) {
  let rgb = oklchToLinear(L, C, h);
  if (inside(rgb)) return rgb.map((v) => Math.min(1, Math.max(0, v)));
  let lo = 0;
  let hi = C;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (inside(oklchToLinear(L, mid, h))) lo = mid;
    else hi = mid;
  }
  rgb = oklchToLinear(L, lo, h);
  return rgb.map((v) => Math.min(1, Math.max(0, v)));
}

const encode = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const css = (rgb) => `rgb(${rgb.map((v) => Math.round(encode(v) * 255)).join(" ")})`;

/**
 * @returns {{ onDark: number[][], onLight: number[][], css: string[], cssLight: string[] }}
 *   onDark / onLight: linear rgb per band for each kind of background
 *   css / cssLight:   the same colors for meters, swatches and small UI
 */
export function bandPalette(name, n) {
  const spec = SPECS[name] ?? SPECS.prism;
  const hues = Array.from({ length: n }, (_, i) =>
    spec.wrap ? spec.from + (spec.span * i) / n : spec.from + (spec.span * i) / Math.max(1, n - 1),
  );
  const onDark = hues.map((h) => fit(0.78, spec.chroma, h));
  const onLight = hues.map((h) => fit(0.6, spec.chroma + 0.02, h));
  return { onDark, onLight, css: onDark.map(css), cssLight: onLight.map(css) };
}
