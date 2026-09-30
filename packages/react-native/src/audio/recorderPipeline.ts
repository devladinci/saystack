import type { INativeRecording, IPcmSource } from "@saystack/core";
import { createPcm16Chunker, createPcmMeter, createResampler, pcm16ToWav } from "@saystack/core";
import { File, Paths } from "expo-file-system";

export interface IRecorderPipelineOptions {
  bands?: number;
  sensitivity?: number;
}

// Where every recorder's audio goes: 16 kHz PCM16 chunks for live transcription, band levels
// for the aura, and the whole take as a WAV file for engines that cannot stream.
export interface IRecorderPipeline {
  readonly pcm: IPcmSource;
  readonly isRecording: boolean;
  begin(): void;
  take(samples: Float32Array, sampleRate: number): void;
  finish(): INativeRecording | null;
  readLevels(): Float32Array | undefined;
  setBands(bands: number): void;
}

type PcmListener = (pcm: Uint8Array<ArrayBuffer>) => void;

export const PIPELINE_RATE = 16000;

const HISTORY_SAMPLES = PIPELINE_RATE;

let recordings = 0;

export function createRecorderPipeline({
  bands = 7,
  sensitivity = 1,
}: IRecorderPipelineOptions = {}): IRecorderPipeline {
  const listeners = new Set<PcmListener>();
  const meter = createPcmMeter({ sampleRate: PIPELINE_RATE, bands, sensitivity });
  const history = new Float32Array(HISTORY_SAMPLES);
  let chunks: Uint8Array[] = [];
  let resample: ((input: Float32Array) => Float32Array) | null = null;
  let resampleFrom = PIPELINE_RATE;
  let lastFile: File | null = null;
  let written = 0;
  let chunkAt = 0;
  let chunkSize = 0;
  let isRecording = false;

  const windowAt = (end: number, out: Float32Array): Float32Array => {
    for (let index = 0; index < out.length; index += 1) {
      const at = end - out.length + index;
      out[index] = at < 0 || at <= written - HISTORY_SAMPLES ? 0 : (history[at % HISTORY_SAMPLES] ?? 0);
    }

    return out;
  };

  const chunker = createPcm16Chunker({
    sampleRate: PIPELINE_RATE,
    onChunk: (pcm) => {
      chunks.push(pcm);

      for (const listener of listeners) {
        listener(pcm);
      }
    },
  });

  return {
    pcm: {
      start(onChunk) {
        listeners.add(onChunk);

        return () => {
          listeners.delete(onChunk);
        };
      },
    },
    get isRecording() {
      return isRecording;
    },
    begin() {
      if (lastFile?.exists === true) {
        lastFile.delete();
      }

      lastFile = null;
      chunks = [];
      history.fill(0);
      meter.reset();
      resample = null;
      written = 0;
      chunkAt = 0;
      chunkSize = 0;
      isRecording = true;
    },
    take(samples, sampleRate) {
      if (!isRecording) {
        return;
      }

      let input = samples;

      if (sampleRate !== PIPELINE_RATE) {
        if (resample === null || resampleFrom !== sampleRate) {
          resample = createResampler(sampleRate, PIPELINE_RATE);
          resampleFrom = sampleRate;
        }

        input = resample(samples);
      }

      for (let index = 0; index < input.length; index += 1) {
        history[(written + index) % HISTORY_SAMPLES] = input[index] ?? 0;
      }

      written += input.length;
      chunkAt = performance.now();
      chunkSize = input.length;
      chunker.push(input);
    },
    finish() {
      const wasRecording = isRecording;
      isRecording = false;
      chunker.flush();

      if (!wasRecording) {
        return null;
      }

      recordings += 1;
      const file = new File(Paths.cache, `saystack-dictation-${recordings}.wav`);
      file.create({ overwrite: true });
      file.write(pcm16ToWav(chunks, PIPELINE_RATE));
      lastFile = file;

      return { uri: file.uri, mimeType: "audio/wav" };
    },
    // Audio arrives in chunks; the levels trail the newest chunk by its length and glide through it,
    // so they move smoothly between chunks.
    readLevels() {
      if (!isRecording) {
        return undefined;
      }

      const glide = Math.min(chunkSize, ((performance.now() - chunkAt) / 1000) * PIPELINE_RATE);

      return meter.advance(Math.floor(Math.max(0, written - chunkSize + glide)), windowAt);
    },
    setBands(count) {
      meter.setBands(count);
    },
  };
}
