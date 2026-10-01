export type AuraLayout = "mirror" | "linear" | "flow";

export type AuraPaletteName = "prism" | "aurora" | "sunset" | "mono";

export type AuraPlacement = "top" | "around" | "bottom";

export type AuraOutline = "fade" | "full";

export interface IAuraStyle {
  bands: number;
  layout: AuraLayout;
  palette: AuraPaletteName;
  lift: number;
  lineWidth: number;
  blur: number;
  aura: number;
  auraSize: number;
  brightness: number;
  rippleSpeed: number;
  resolution: number;
  placement: AuraPlacement;
  outline: AuraOutline;
}

export type AuraBackground = "dark" | "light";

export interface IAuraStyleOptions extends Partial<IAuraStyle> {
  dark?: Partial<IAuraStyle>;
  light?: Partial<IAuraStyle>;
}

export interface IAuraRange {
  min: number;
  max: number;
  step: number;
}

export type AuraNumericKey =
  "bands" | "lift" | "lineWidth" | "blur" | "aura" | "auraSize" | "brightness" | "rippleSpeed" | "resolution";

export const AURA_RANGES: Readonly<Record<AuraNumericKey, IAuraRange>> = {
  bands: { min: 1, max: 8, step: 1 },
  lift: { min: 0, max: 128, step: 1 },
  lineWidth: { min: 0.5, max: 8, step: 0.1 },
  blur: { min: 0, max: 24, step: 0.5 },
  aura: { min: 0, max: 3, step: 0.05 },
  auraSize: { min: 1, max: 64, step: 1 },
  brightness: { min: 0.05, max: 4, step: 0.05 },
  rippleSpeed: { min: 0, max: 5, step: 0.05 },
  resolution: { min: 0.25, max: 2, step: 0.05 },
};

export const AURA_LAYOUTS: readonly AuraLayout[] = ["mirror", "linear", "flow"];

export const AURA_PALETTES: readonly AuraPaletteName[] = ["prism", "aurora", "sunset", "mono"];

export const AURA_PLACEMENTS: readonly AuraPlacement[] = ["top", "around", "bottom"];

export const AURA_OUTLINES: readonly AuraOutline[] = ["fade", "full"];

export const DEFAULT_AURA_STYLE: Readonly<IAuraStyle> = {
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
};

// Light adds up on dark backgrounds, so the same glow reads louder there than on light ones.
export const MESSAGE_AURA_STYLE: Readonly<IAuraStyleOptions> = {
  outline: "full",
  placement: "top",
  lift: 16,
  dark: { lineWidth: 1.2, blur: 6, aura: 0.45, auraSize: 6, brightness: 0.28 },
  light: { lineWidth: 1.8, blur: 2, aura: 0.75, auraSize: 8, brightness: 0.55 },
};

export function auraStyleFor(
  { dark, light, ...shared }: IAuraStyleOptions,
  background: AuraBackground,
): Partial<IAuraStyle> {
  return { ...shared, ...(background === "dark" ? dark : light) };
}

const clampNumber = (key: AuraNumericKey, value: number | undefined): number => {
  const range = AURA_RANGES[key];

  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_AURA_STYLE[key];
  }

  const clamped = Math.min(range.max, Math.max(range.min, value));

  return key === "bands" ? Math.round(clamped) : clamped;
};

const pick = <T extends string>(allowed: readonly T[], value: T | undefined, fallback: T): T =>
  value !== undefined && allowed.includes(value) ? value : fallback;

export function resolveAuraStyle(style: Partial<IAuraStyle> = {}): IAuraStyle {
  return {
    bands: clampNumber("bands", style.bands),
    layout: pick(AURA_LAYOUTS, style.layout, DEFAULT_AURA_STYLE.layout),
    palette: pick(AURA_PALETTES, style.palette, DEFAULT_AURA_STYLE.palette),
    lift: clampNumber("lift", style.lift),
    lineWidth: clampNumber("lineWidth", style.lineWidth),
    blur: clampNumber("blur", style.blur),
    aura: clampNumber("aura", style.aura),
    auraSize: clampNumber("auraSize", style.auraSize),
    brightness: clampNumber("brightness", style.brightness),
    rippleSpeed: clampNumber("rippleSpeed", style.rippleSpeed),
    resolution: clampNumber("resolution", style.resolution),
    placement: pick(AURA_PLACEMENTS, style.placement, DEFAULT_AURA_STYLE.placement),
    outline: pick(AURA_OUTLINES, style.outline, DEFAULT_AURA_STYLE.outline),
  };
}
