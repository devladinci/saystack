import type { AuraBackground, AuraClip, IAuraRect, IAuraStyleOptions } from "@saystack/core";
import { auraStyleFor, DEFAULT_AURA_STYLE, resolveAuraStyle } from "@saystack/core";

// Past the view's sides, so only the top edge of this outline shows and the wave hangs straight down.
const SIDE_OVERHANG = 80;

const TALL = 1400;

const CORNER = 44;

// The bands both spotlights hang from the screen's top edge, while you talk and while a reply is read.
export const TOP_WAVE_STYLE: IAuraStyleOptions = { ...DEFAULT_AURA_STYLE, placement: "top", outline: "fade" };

export function auraReach(style: IAuraStyleOptions, background: AuraBackground, gap: number): number {
  const look = resolveAuraStyle(auraStyleFor(style, background));

  return Math.ceil(gap + look.lineWidth + look.lift * 1.3 + look.auraSize * 4 + 2 + look.blur * 3);
}

export function topEdgeOutline(width: number): IAuraRect {
  return { x: -SIDE_OVERHANG, y: 0, w: width + SIDE_OVERHANG * 2, h: TALL, r: CORNER, isPage: false, isInner: true };
}

// The clip fades the wave out at the screen's sides; above and below, its fade stays out of view.
export function topEdgeClip(width: number, height: number): AuraClip {
  return [0, -40, width, height + 200];
}
