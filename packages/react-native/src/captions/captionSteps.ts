export interface ICaptionStep {
  fontSize: number;
  lines: number;
}

export interface ICaptionLayout {
  step: number;
  isScrolling: boolean;
}

// A long dictation shrinks twice, then scrolls with the newest line at the bottom.
export const CAPTION_STEPS: readonly ICaptionStep[] = [
  { fontSize: 26, lines: 4 },
  { fontSize: 21, lines: 6 },
  { fontSize: 18, lines: 8 },
];

export const CAPTION_LINE_HEIGHT = 1.3;

// Steps only grow within one dictation, so the text never jumps back up while it streams.
export function fitCaption(step: number, lineCount: number, steps: readonly ICaptionStep[] = CAPTION_STEPS): ICaptionLayout {
  const last = steps.length - 1;
  const current = Math.min(Math.max(0, step), last);
  const limit = steps[current]?.lines ?? Infinity;

  if (lineCount <= limit) {
    return { step: current, isScrolling: false };
  }

  if (current < last) {
    return { step: current + 1, isScrolling: false };
  }

  return { step: current, isScrolling: true };
}

export function visibleCaptionLines<T>(lines: readonly T[], step: number, steps: readonly ICaptionStep[] = CAPTION_STEPS): readonly T[] {
  const limit = steps[Math.min(Math.max(0, step), steps.length - 1)]?.lines ?? lines.length;

  return lines.length > limit ? lines.slice(lines.length - limit) : lines;
}
