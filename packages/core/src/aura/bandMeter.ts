export interface IBandMeterOptions {
  bands: number;
  sampleRate: number;
  binCount: number;
  minHz?: number;
  maxHz?: number;
  sensitivity?: number;
  isNoiseTracked?: boolean;
}

export interface IBandMeter {
  readonly levels: Float32Array;
  readonly decibels: Float32Array;
  update(spectrumDb: Float32Array, dtSeconds: number): Float32Array;
  setSensitivity(sensitivity: number): void;
  reset(): void;
}

const DEFAULT_MIN_HZ = 80;

const DEFAULT_MAX_HZ = 8000;

const TILT_DB_PER_OCTAVE = 4;

const TILT_FROM_HZ = 300;

const RANGE_DB = 30;

const SILENT_DB = -120;

const NOISE_FACTOR = 2;

const NOISE_GATE = 0.5;

const NOISE_SLOT_SECONDS = 0.1;

const NOISE_SLOTS = 12;

const PEAK_FALL_DB_PER_SECOND = 5;

const PEAK_FLOOR_DB = -80;

const CONTRAST = 1.6;

export function bandEdges(count: number, minHz = DEFAULT_MIN_HZ, maxHz = DEFAULT_MAX_HZ): number[] {
  const bands = Math.max(1, Math.round(count));

  return Array.from({ length: bands + 1 }, (_, index) => minHz * (maxHz / minHz) ** (index / bands));
}

export function createBandMeter({
  bands,
  sampleRate,
  binCount,
  minHz = DEFAULT_MIN_HZ,
  maxHz = DEFAULT_MAX_HZ,
  sensitivity = 1,
  isNoiseTracked = true,
}: IBandMeterOptions): IBandMeter {
  const edges = bandEdges(bands, minHz, maxHz);
  const count = edges.length - 1;
  const binHz = sampleRate / (binCount * 2);
  const ranges = Array.from({ length: count }, (_, index) => {
    const low = Math.max(1, Math.floor((edges[index] ?? 0) / binHz));
    const high = Math.max(low + 1, Math.min(binCount, Math.ceil((edges[index + 1] ?? 0) / binHz)));

    return [low, high] as const;
  });
  const tilt = ranges.map((_, index) => {
    const centre = Math.sqrt((edges[index] ?? 1) * (edges[index + 1] ?? 1));

    return TILT_DB_PER_OCTAVE * Math.max(0, Math.log2(centre / TILT_FROM_HZ));
  });

  const levels = new Float32Array(count);
  const decibels = new Float32Array(count).fill(SILENT_DB);
  // The quietest power seen per band in each recent slot; their minimum is the steady noise.
  const quietest = Array.from({ length: count }, () => new Float64Array(NOISE_SLOTS).fill(Infinity));
  let slot = 0;
  let slotAge = 0;
  let peak = PEAK_FLOOR_DB;
  let range = RANGE_DB * sensitivity;

  const noiseOf = (band: number): number => {
    const slots = quietest[band];

    if (slots === undefined) {
      return 0;
    }

    let lowest = Infinity;

    for (const value of slots) {
      lowest = Math.min(lowest, value);
    }

    return Number.isFinite(lowest) ? lowest : 0;
  };

  const update = (spectrumDb: Float32Array, dtSeconds: number): Float32Array => {
    const dt = Math.min(0.1, Math.max(0, dtSeconds));

    if (dt === 0) {
      return levels;
    }

    const attack = 1 - Math.exp(-dt / 0.025);
    const release = 1 - Math.exp(-dt / 0.14);
    let top = SILENT_DB;
    slotAge += dt;

    if (slotAge >= NOISE_SLOT_SECONDS) {
      slotAge = 0;
      slot = (slot + 1) % NOISE_SLOTS;

      for (const slots of quietest) {
        slots[slot] = Infinity;
      }
    }

    ranges.forEach(([low, high], index) => {
      let power = 0;

      for (let bin = low; bin < high; bin += 1) {
        const value = spectrumDb[bin] ?? SILENT_DB;

        if (value > -160) {
          power += 10 ** (value / 10);
        }
      }

      power /= high - low;

      const slots = quietest[index];

      if (isNoiseTracked && power > 0 && slots !== undefined) {
        slots[slot] = Math.min(slots[slot] ?? Infinity, power);
      }

      const noise = isNoiseTracked ? noiseOf(index) : 0;
      const clean = power - noise * NOISE_FACTOR;
      const level = clean > 1e-13 && clean > noise * NOISE_GATE ? 10 * Math.log10(clean) + (tilt[index] ?? 0) : SILENT_DB;

      decibels[index] = level;
      top = Math.max(top, level);
    });

    peak = top > peak ? top : Math.max(PEAK_FLOOR_DB, peak - PEAK_FALL_DB_PER_SECOND * dt);

    for (let index = 0; index < count; index += 1) {
      const current = levels[index] ?? 0;
      const target = Math.min(1, Math.max(0, ((decibels[index] ?? SILENT_DB) - (peak - range)) / range)) ** CONTRAST;

      levels[index] = current + (target - current) * (target > current ? attack : release);
    }

    return levels;
  };

  return {
    levels,
    decibels,
    update,
    setSensitivity(next) {
      range = RANGE_DB * Math.max(0.1, next);
    },
    reset() {
      levels.fill(0);
      decibels.fill(SILENT_DB);

      for (const slots of quietest) {
        slots.fill(Infinity);
      }

      slot = 0;
      slotAge = 0;
      peak = PEAK_FLOOR_DB;
    },
  };
}
