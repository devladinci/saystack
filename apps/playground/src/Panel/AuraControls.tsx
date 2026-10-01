import type { AuraNumericKey, IAuraStyle } from "@saystack/core";
import { AURA_LAYOUTS, AURA_OUTLINES, AURA_PALETTES, AURA_PLACEMENTS, AURA_RANGES } from "@saystack/core";

import type { AuraTarget } from "../settings.js";
import { Range } from "./Range.js";
import { Segment } from "./Segment.js";

interface IProps {
  target: AuraTarget;
  style: IAuraStyle;
  onTarget: (target: AuraTarget) => void;
  onChange: (next: Partial<IAuraStyle>) => void;
}

interface INumericControl {
  key: Exclude<AuraNumericKey, "bands">;
  label: string;
  format: (value: number) => string;
}

const TARGETS = [
  { value: "dictation", label: "Dictation" },
  { value: "readAloud", label: "Read aloud" },
] as const;

const BANDS = Array.from({ length: AURA_RANGES.bands.max - AURA_RANGES.bands.min + 1 }, (_, index) => {
  const value = AURA_RANGES.bands.min + index;

  return { value, label: String(value) };
});

const LAYOUT_LABELS = { mirror: "Mirrored", linear: "Low → high", flow: "Flow" } as const;
const PALETTE_LABELS = { prism: "Prism", aurora: "Aurora", sunset: "Sunset", mono: "Mono" } as const;
const PLACEMENT_LABELS = { top: "Top edge", around: "All around", bottom: "Bottom edge" } as const;
const OUTLINE_LABELS = { fade: "Fades out", full: "Full" } as const;

const px = (value: number): string => `${value} px`;
const times = (value: number): string => `${value.toFixed(2)}×`;

const NUMERIC_CONTROLS: readonly INumericControl[] = [
  { key: "lift", label: "Lift", format: px },
  { key: "lineWidth", label: "Line width", format: (value) => `${value.toFixed(1)} px` },
  { key: "blur", label: "Blur", format: (value) => (value === 0 ? "Crisp" : px(value)) },
  { key: "aura", label: "Aura", format: (value) => (value === 0 ? "Lines only" : value.toFixed(2)) },
  { key: "auraSize", label: "Aura size", format: px },
  { key: "brightness", label: "Brightness", format: (value) => value.toFixed(2) },
  { key: "rippleSpeed", label: "Ripple speed", format: times },
  { key: "resolution", label: "Resolution", format: times },
];

export function AuraControls({ target, style, onTarget, onChange }: IProps) {
  return (
    <section className="p-section">
      <h2 className="p-title">Aura</h2>
      <Segment label="Tuning" value={target} options={TARGETS} onChange={onTarget} />
      <Segment label="Bands" value={style.bands} options={BANDS} onChange={(bands) => onChange({ bands })} />
      <Segment
        label="Layout"
        value={style.layout}
        options={AURA_LAYOUTS.map((value) => ({ value, label: LAYOUT_LABELS[value] }))}
        onChange={(layout) => onChange({ layout })}
      />
      <Segment
        label="Colors"
        value={style.palette}
        options={AURA_PALETTES.map((value) => ({ value, label: PALETTE_LABELS[value] }))}
        onChange={(palette) => onChange({ palette })}
      />
      <Segment
        label="Bands sit on"
        value={style.placement}
        options={AURA_PLACEMENTS.map((value) => ({ value, label: PLACEMENT_LABELS[value] }))}
        onChange={(placement) => onChange({ placement })}
      />
      <Segment
        label="Outline"
        value={style.outline}
        options={AURA_OUTLINES.map((value) => ({ value, label: OUTLINE_LABELS[value] }))}
        onChange={(outline) => onChange({ outline })}
      />
      {NUMERIC_CONTROLS.map(({ key, label, format }) => (
        <Range
          key={key}
          label={label}
          value={style[key]}
          range={AURA_RANGES[key]}
          format={format}
          onChange={(value) => onChange({ [key]: value })}
        />
      ))}
    </section>
  );
}
