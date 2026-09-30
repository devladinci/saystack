import type { IBandMeter } from "@saystack/core";
import { createBandMeter, DEFAULT_AURA_STYLE } from "@saystack/core";

import { sharedAudioContext } from "./audioContext.js";

export interface IAudioLevelsOptions {
  bands?: number;
  sensitivity?: number;
  isAudible?: boolean;
  context?: AudioContext;
  fftSize?: number;
}

export interface IAudioLevels {
  readonly input: AudioNode;
  readonly levels: Float32Array;
  read(): Float32Array;
  listen(stream: MediaStream): () => void;
  setBands(bands: number): void;
  setSensitivity(sensitivity: number): void;
  reset(): void;
  dispose(): void;
}

export function createAudioLevels({
  bands = DEFAULT_AURA_STYLE.bands,
  sensitivity = 1,
  isAudible = false,
  context,
  fftSize = 2048,
}: IAudioLevelsOptions = {}): IAudioLevels {
  const audioContext = context ?? sharedAudioContext();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = fftSize;
  analyser.smoothingTimeConstant = 0.3;
  const spectrum = new Float32Array(analyser.frequencyBinCount);
  // An analyser only runs while something pulls it, so a silent one still feeds the speakers at zero gain.
  const mute = isAudible ? null : audioContext.createGain();

  if (mute === null) {
    analyser.connect(audioContext.destination);
  } else {
    mute.gain.value = 0;
    analyser.connect(mute);
    mute.connect(audioContext.destination);
  }

  let currentSensitivity = sensitivity;
  let lastRead = 0;
  const createMeter = (count: number): IBandMeter =>
    createBandMeter({
      bands: count,
      sampleRate: audioContext.sampleRate,
      binCount: analyser.frequencyBinCount,
      sensitivity: currentSensitivity,
      isNoiseTracked: !isAudible,
    });
  let meter = createMeter(bands);

  return {
    input: analyser,
    get levels() {
      return meter.levels;
    },
    read() {
      const now = performance.now();
      const dt = lastRead === 0 ? 1 / 60 : (now - lastRead) / 1000;
      lastRead = now;
      analyser.getFloatFrequencyData(spectrum);

      return meter.update(spectrum, dt);
    },
    listen(stream) {
      if (audioContext.state === "suspended") {
        void audioContext.resume();
      }

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      return () => {
        source.disconnect();
      };
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
      meter.reset();
      lastRead = 0;
    },
    dispose() {
      analyser.disconnect();
      mute?.disconnect();
    },
  };
}
