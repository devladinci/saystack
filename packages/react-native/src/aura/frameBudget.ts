export interface IFrameBudget {
  readonly quality: number;
  // How long a frame took to draw; returns how long to rest before the next one.
  record(costMs: number): number;
}

export interface IFrameBudgetOptions {
  targetMs?: number;
  minQuality?: number;
}

const WARMUP_FRAMES = 2;

const MAX_SAMPLE_MS = 250;

// GL runs on the JS thread in Expo, so a slow GPU (the iOS simulator draws in software) would stall the app.
// The drawing gets smaller until a frame fits the budget, and frames are skipped when even that is too slow.
export function createFrameBudget({ targetMs = 8, minQuality = 0.2 }: IFrameBudgetOptions = {}): IFrameBudget {
  let quality = 1;
  let average = 0;
  let frames = 0;

  return {
    get quality() {
      return quality;
    },
    record(costMs) {
      frames += 1;

      if (frames <= WARMUP_FRAMES) {
        return 0;
      }

      const cost = Math.min(MAX_SAMPLE_MS, Math.max(0, costMs));
      average = average === 0 ? cost : average * 0.7 + cost * 0.3;

      if (average > targetMs * 1.5 && quality > minQuality) {
        const next = Math.max(minQuality, quality * Math.sqrt(targetMs / average));
        average *= (next / quality) ** 2;
        quality = next;
      } else if (average < targetMs * 0.4 && quality < 1) {
        const next = Math.min(1, quality * 1.15);
        average *= (next / quality) ** 2;
        quality = next;
      }

      return average > targetMs * 1.5 ? average * 2 : 0;
    },
  };
}
