import type { AuraState, IAuraStyleOptions } from "@saystack/core";
import { useAura } from "@saystack/react-web";
import { useState } from "react";

interface IProps {
  state: AuraState;
  levels: () => ArrayLike<number> | undefined;
  style: IAuraStyleOptions;
}

// Above the screen, under the bezel that hides what the wave draws past the screen's rounded corners.
const WAVE_LAYER = 30;

// An outline wider and taller than the screen, so only its top edge shows and the bands hang from the top,
// as in @saystack/react-native. The clip starts above the screen, so its fade never eats the wave.
export function TopWave({ state, levels, style }: IProps) {
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const [clip, setClip] = useState<HTMLDivElement | null>(null);

  useAura(anchor, { state, levels, style, clip, isInside: true, gap: 0, padding: 0, zIndex: WAVE_LAYER });

  return (
    <>
      <div ref={setAnchor} className="wave-anchor" aria-hidden="true" />
      <div ref={setClip} className="wave-clip" aria-hidden="true" />
    </>
  );
}
