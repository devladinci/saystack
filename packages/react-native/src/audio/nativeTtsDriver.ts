import type { IPcmLevels, IPcmMeter, ISpeechClipResult, ITtsDriver, RequestHeaders, SpeechFetch } from "@saystack/core";
import { createHttpSynthesize, createPcmLevels, createPcmMeter } from "@saystack/core";
import { setAudioModeAsync } from "expo-audio";

import type { INativeClip } from "./nativeClip.js";
import { createNativeClip } from "./nativeClip.js";

export interface INativeTtsDriverOptions {
  endpoint: string;
  headers?: RequestHeaders;
  fetch?: SpeechFetch;
  bands?: number;
}

export interface INativeTtsDriver extends ITtsDriver {
  readLevels(): Float32Array | undefined;
  setBands(bands: number): void;
}

export function createNativeTtsDriver({
  endpoint,
  headers = {},
  fetch,
  bands = 7,
}: INativeTtsDriverOptions): INativeTtsDriver {
  let active: INativeClip | null = null;
  let meter: { clip: INativeClip; meter: IPcmMeter } | null = null;
  let sampled: IPcmLevels | null = null;
  let levelBands = bands;
  let lastRead = 0;

  const meterFor = (clip: INativeClip, sampleRate: number): IPcmMeter => {
    if (meter === null || meter.clip !== clip) {
      meter = { clip, meter: createPcmMeter({ sampleRate, bands: levelBands, isNoiseTracked: false }) };
    }

    return meter.meter;
  };

  // Player samples come at the output rate, which is 44.1 or 48 kHz on phones.
  const sampledLevels = (heard: Float32Array): Float32Array => {
    if (sampled === null) {
      sampled = createPcmLevels({ sampleRate: 44100, bands: levelBands, isNoiseTracked: false });
    }

    const now = performance.now();
    const dt = lastRead === 0 ? 1 / 60 : (now - lastRead) / 1000;
    lastRead = now;

    return sampled.update(heard, dt);
  };

  return {
    unlock: () => {
      void setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
    },

    synthesize: createHttpSynthesize({ endpoint, headers, ...(fetch === undefined ? {} : { fetch }) }),

    createClip: async (audio): Promise<ISpeechClipResult> => {
      try {
        const clip = await createNativeClip(audio, {
          onPlay: (playing) => {
            active = playing;
          },
          onRelease: (released) => {
            if (active === released) {
              active = null;
            }
          },
        });

        return { ok: true, clip };
      } catch (error: unknown) {
        return {
          ok: false,
          errorCode: "TTS_UNSUPPORTED_MEDIA",
          message: error instanceof Error ? error.message : "the audio could not be played",
        };
      }
    },

    readLevels() {
      const clip = active;

      if (clip === null || !clip.isPlaying) {
        lastRead = 0;
        return undefined;
      }

      const { decoded, heard } = clip;

      if (decoded === null) {
        return heard === null ? undefined : sampledLevels(heard);
      }

      const windowAt = (end: number, out: Float32Array): Float32Array => {
        out.fill(0);
        const from = Math.max(0, Math.min(decoded.samples.length, end) - out.length);
        const slice = decoded.samples.subarray(from, Math.min(decoded.samples.length, end));
        out.set(slice, out.length - slice.length);

        return out;
      };

      return meterFor(clip, decoded.sampleRate).advance(
        Math.round((clip.currentTime ?? 0) * decoded.sampleRate),
        windowAt,
      );
    },

    setBands(count) {
      levelBands = count;
      meter?.meter.setBands(count);
      sampled?.setBands(count);
    },
  };
}
