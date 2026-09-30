import { describe, expect, it } from "vitest";

import {
  createPcmLevels,
  createPcmMeter,
  createSampleWindow,
  createSpectrumAnalyser,
  fftSizeFor,
} from "../src/aura/spectrum.js";

const tone = (hz: number, sampleRate: number, length: number, amplitude = 0.5): Float32Array =>
  Float32Array.from({ length }, (_, index) => amplitude * Math.sin((2 * Math.PI * hz * index) / sampleRate));

const naiveDecibels = (samples: Float32Array, bin: number, smoothing: number): number => {
  const size = samples.length;
  let real = 0;
  let imaginary = 0;

  for (let index = 0; index < size; index += 1) {
    const phase = (2 * Math.PI * index) / size;
    const windowed = (samples[index] ?? 0) * (0.42 - 0.5 * Math.cos(phase) + 0.08 * Math.cos(2 * phase));
    real += windowed * Math.cos((2 * Math.PI * bin * index) / size);
    imaginary -= windowed * Math.sin((2 * Math.PI * bin * index) / size);
  }

  return 20 * Math.log10((1 - smoothing) * (Math.hypot(real, imaginary) / size));
};

describe("createSpectrumAnalyser", () => {
  it("puts a tone in its bin", () => {
    const analyser = createSpectrumAnalyser({ fftSize: 1024 });
    const spectrum = analyser.analyse(tone(1000, 16000, 1024));
    const peak = spectrum.indexOf(Math.max(...spectrum));

    expect(peak).toBe(64);
  });

  it("matches the browser analyser's maths", () => {
    const noise = Float32Array.from({ length: 256 }, (_, index) => Math.sin(index * 12.9898) * 0.3);
    const spectrum = createSpectrumAnalyser({ fftSize: 256, smoothing: 0.3 }).analyse(noise);

    for (const bin of [1, 7, 40, 101]) {
      expect(spectrum[bin]).toBeCloseTo(naiveDecibels(noise, bin, 0.3), 2);
    }
  });

  it("smooths over time and reads only the newest samples", () => {
    const analyser = createSpectrumAnalyser({ fftSize: 512, smoothing: 0.5 });
    const loud = tone(2000, 16000, 2048);
    const first = analyser.analyse(loud)[64] ?? 0;
    const second = analyser.analyse(loud)[64] ?? 0;
    const silence = analyser.analyse(new Float32Array(512))[64] ?? 0;

    expect(second).toBeGreaterThan(first);
    expect(second - first).toBeCloseTo(20 * Math.log10(0.75 / 0.5), 3);
    expect(silence).toBeCloseTo(second - 20 * Math.log10(0.75 / 0.375), 3);
  });

  it("refuses a size the transform cannot split", () => {
    expect(() => createSpectrumAnalyser({ fftSize: 1000 })).toThrow("power of two");
  });
});

describe("fftSizeFor", () => {
  it("keeps about the browser's span of time at any rate", () => {
    expect([48000, 44100, 24000, 16000, 8000].map(fftSizeFor)).toEqual([2048, 2048, 1024, 1024, 512]);
  });
});

describe("createSampleWindow", () => {
  it("keeps the newest samples in order", () => {
    const window = createSampleWindow(4);

    window.write([1, 2]);
    window.write([3]);
    expect(Array.from(window.samples)).toEqual([0, 1, 2, 3]);

    window.write([4, 5, 6, 7, 8]);
    expect(Array.from(window.samples)).toEqual([5, 6, 7, 8]);

    window.clear();
    expect(Array.from(window.samples)).toEqual([0, 0, 0, 0]);
  });
});

describe("createPcmLevels", () => {
  it("raises the band a voice is in", () => {
    const levels = createPcmLevels({ sampleRate: 16000, bands: 7, isNoiseTracked: false });
    const low = tone(200, 16000, 1024);
    const high = tone(5000, 16000, 1024);

    for (let frame = 0; frame < 30; frame += 1) {
      levels.update(low, 1 / 60);
    }

    const heard = Array.from(levels.levels);

    expect(heard.indexOf(Math.max(...heard))).toBe(1);

    levels.reset();

    for (let frame = 0; frame < 30; frame += 1) {
      levels.update(high, 1 / 60);
    }

    const hiss = Array.from(levels.levels);

    expect(hiss.indexOf(Math.max(...hiss))).toBe(6);
  });
});

describe("createPcmMeter", () => {
  const rate = 16000;
  const speech = Float32Array.from({ length: rate * 2 }, (_, index) =>
    index < rate / 2
      ? 0.001 * Math.sin(index * 1.7)
      : 0.4 * Math.sin((2 * Math.PI * 300 * index) / rate) * (0.6 + 0.4 * Math.sin(index / 900)),
  );
  const windowAt = (end: number, out: Float32Array): Float32Array => {
    out.fill(0);
    const from = Math.max(0, end - out.length);
    out.set(speech.subarray(from, end), out.length - (end - from));

    return out;
  };

  const meterEvery = (readMs: number): Float32Array => {
    const meter = createPcmMeter({ sampleRate: rate, bands: 7 });

    for (let time = 0; time <= 1500; time += readMs) {
      meter.advance(Math.round((time / 1000) * rate), windowAt);
    }

    return Float32Array.from(meter.levels);
  };

  it("hears the voice however rarely it is read", () => {
    const smooth = meterEvery(16);
    const sparse = meterEvery(500);

    expect(Math.max(...smooth)).toBeGreaterThan(0.5);
    expect(Math.max(...sparse)).toBeGreaterThan(0.5);
    sparse.forEach((level, band) => {
      expect(Math.abs(level - (smooth[band] ?? 0))).toBeLessThan(0.1);
    });
  });

  it("catches up at most a quarter of a second of audio at once", () => {
    const meter = createPcmMeter({ sampleRate: rate, bands: 7 });
    let calls = 0;

    meter.advance(rate * 2, (end, out) => {
      calls += 1;
      return windowAt(end, out);
    });

    expect(calls).toBe(15);
  });
});
