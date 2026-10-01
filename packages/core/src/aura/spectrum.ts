import type { IBandMeter } from "./bandMeter.js";
import { createBandMeter } from "./bandMeter.js";

export interface ISpectrumAnalyserOptions {
  fftSize?: number;
  smoothing?: number;
}

export interface ISpectrumAnalyser {
  readonly fftSize: number;
  readonly binCount: number;
  analyse(window: ArrayLike<number>, out?: Float32Array): Float32Array;
  reset(): void;
}

export interface IPcmLevelsOptions {
  sampleRate: number;
  bands?: number;
  fftSize?: number;
  smoothing?: number;
  sensitivity?: number;
  isNoiseTracked?: boolean;
}

export interface IPcmLevels {
  readonly fftSize: number;
  readonly levels: Float32Array;
  update(window: ArrayLike<number>, dtSeconds: number): Float32Array;
  setBands(bands: number): void;
  setSensitivity(sensitivity: number): void;
  reset(): void;
}

export interface IPcmMeterOptions extends IPcmLevelsOptions {
  stepSeconds?: number;
  maxSteps?: number;
}

export type PcmWindowReader = (end: number, out: Float32Array) => ArrayLike<number>;

export interface IPcmMeter {
  readonly fftSize: number;
  readonly levels: Float32Array;
  advance(position: number, windowAt: PcmWindowReader): Float32Array;
  setBands(bands: number): void;
  setSensitivity(sensitivity: number): void;
  reset(): void;
}

export interface ISampleWindow {
  readonly samples: Float32Array;
  write(chunk: ArrayLike<number>): void;
  clear(): void;
}

// What analyse() reports for a bin with no energy at all, where the decibels would be -Infinity.
const SILENCE_DB = -200;

const isPowerOfTwo = (value: number): boolean => value >= 2 && (value & (value - 1)) === 0;

// The browser analyser looks at 2048 samples at 48 kHz; other rates keep about the same span of time.
export function fftSizeFor(sampleRate: number): number {
  const size = 2 ** Math.ceil(Math.log2(Math.max(1, (2048 * sampleRate) / 48000)));

  return Math.min(32768, Math.max(256, size));
}

// The same numbers AnalyserNode.getFloatFrequencyData gives: Blackman window, magnitude over N,
// smoothed over time, in decibels.
export function createSpectrumAnalyser({
  fftSize = 2048,
  smoothing = 0.3,
}: ISpectrumAnalyserOptions = {}): ISpectrumAnalyser {
  if (!isPowerOfTwo(fftSize)) {
    throw new Error(`spectrum: fftSize must be a power of two, got ${fftSize}`);
  }

  const size = fftSize;
  const binCount = size / 2;
  const blackman = new Float64Array(size);
  const cosines = new Float64Array(binCount);
  const sines = new Float64Array(binCount);
  const reversed = new Uint32Array(size);
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  const smoothed = new Float64Array(binCount);
  const bits = Math.log2(size);

  for (let index = 0; index < size; index += 1) {
    const phase = (2 * Math.PI * index) / size;
    blackman[index] = 0.42 - 0.5 * Math.cos(phase) + 0.08 * Math.cos(2 * phase);
    let flipped = 0;

    for (let bit = 0; bit < bits; bit += 1) {
      flipped = (flipped << 1) | ((index >> bit) & 1);
    }

    reversed[index] = flipped;
  }

  for (let index = 0; index < binCount; index += 1) {
    cosines[index] = Math.cos((2 * Math.PI * index) / size);
    sines[index] = -Math.sin((2 * Math.PI * index) / size);
  }

  const transform = (): void => {
    for (let span = 2; span <= size; span *= 2) {
      const half = span / 2;
      const stride = size / span;

      for (let start = 0; start < size; start += span) {
        for (let offset = 0; offset < half; offset += 1) {
          const twiddle = offset * stride;
          const cos = cosines[twiddle] ?? 1;
          const sin = sines[twiddle] ?? 0;
          const even = start + offset;
          const odd = even + half;
          const oddReal = real[odd] ?? 0;
          const oddImaginary = imaginary[odd] ?? 0;
          const productReal = oddReal * cos - oddImaginary * sin;
          const productImaginary = oddReal * sin + oddImaginary * cos;
          const evenReal = real[even] ?? 0;
          const evenImaginary = imaginary[even] ?? 0;
          real[odd] = evenReal - productReal;
          imaginary[odd] = evenImaginary - productImaginary;
          real[even] = evenReal + productReal;
          imaginary[even] = evenImaginary + productImaginary;
        }
      }
    }
  };

  return {
    fftSize: size,
    binCount,
    analyse(window, out = new Float32Array(binCount)) {
      const offset = window.length - size;

      for (let index = 0; index < size; index += 1) {
        const sample = offset + index < 0 ? 0 : (window[offset + index] ?? 0);
        const target = reversed[index] ?? 0;
        real[target] = sample * (blackman[index] ?? 0);
        imaginary[target] = 0;
      }

      transform();

      for (let bin = 0; bin < binCount; bin += 1) {
        const magnitude = Math.hypot(real[bin] ?? 0, imaginary[bin] ?? 0) / size;
        const value = smoothing * (smoothed[bin] ?? 0) + (1 - smoothing) * magnitude;
        smoothed[bin] = value;
        out[bin] = value > 0 ? 20 * Math.log10(value) : SILENCE_DB;
      }

      return out;
    },
    reset() {
      smoothed.fill(0);
    },
  };
}

export function createPcmLevels({
  sampleRate,
  bands = 7,
  fftSize = fftSizeFor(sampleRate),
  smoothing = 0.3,
  sensitivity = 1,
  isNoiseTracked = true,
}: IPcmLevelsOptions): IPcmLevels {
  const analyser = createSpectrumAnalyser({ fftSize, smoothing });
  const spectrum = new Float32Array(analyser.binCount);
  let currentSensitivity = sensitivity;
  const createMeter = (count: number): IBandMeter =>
    createBandMeter({
      bands: count,
      sampleRate,
      binCount: analyser.binCount,
      sensitivity: currentSensitivity,
      isNoiseTracked,
    });
  let meter = createMeter(bands);

  return {
    fftSize,
    get levels() {
      return meter.levels;
    },
    update(window, dtSeconds) {
      analyser.analyse(window, spectrum);

      return meter.update(spectrum, dtSeconds);
    },
    setBands(count) {
      if (count !== meter.levels.length) {
        meter = createMeter(count);
      }
    },
    setSensitivity(next) {
      currentSensitivity = next;
      meter.setSensitivity(next);
    },
    reset() {
      analyser.reset();
      meter.reset();
    },
  };
}

export function createSampleWindow(size: number): ISampleWindow {
  const samples = new Float32Array(size);

  return {
    samples,
    write(chunk) {
      const count = chunk.length;

      if (count >= size) {
        for (let index = 0; index < size; index += 1) {
          samples[index] = chunk[count - size + index] ?? 0;
        }

        return;
      }

      samples.copyWithin(0, count);

      for (let index = 0; index < count; index += 1) {
        samples[size - count + index] = chunk[index] ?? 0;
      }
    },
    clear() {
      samples.fill(0);
    },
  };
}

// Meters audio on its own clock, in fixed steps up to `position` (in samples), so the levels and the
// noise floor come out the same however often they are drawn. A long gap only meters its last steps.
export function createPcmMeter({ stepSeconds = 1 / 60, maxSteps = 15, ...options }: IPcmMeterOptions): IPcmMeter {
  const levels = createPcmLevels(options);
  const step = Math.max(1, Math.round(options.sampleRate * stepSeconds));
  const scratch = new Float32Array(levels.fftSize);
  let metered: number | null = null;

  return {
    fftSize: levels.fftSize,
    get levels() {
      return levels.levels;
    },
    advance(position, windowAt) {
      const earliest = Math.max(0, position - step * maxSteps);
      metered = metered === null || position < metered ? earliest : Math.max(metered, earliest);

      while (metered + step <= position) {
        metered += step;
        levels.update(windowAt(metered, scratch), step / options.sampleRate);
      }

      return levels.levels;
    },
    setBands(count) {
      levels.setBands(count);
    },
    setSensitivity(next) {
      levels.setSensitivity(next);
    },
    reset() {
      metered = null;
      levels.reset();
    },
  };
}
