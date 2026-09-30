import { decodeWav } from "@saystack/core";

import type { INativeRecorder } from "./nativeRecorder.js";
import type { IRecorderPipelineOptions } from "./recorderPipeline.js";
import { createRecorderPipeline } from "./recorderPipeline.js";

export interface IClipRecorderOptions extends IRecorderPipelineOptions {
  load: () => Promise<ArrayBuffer>;
  chunkMs?: number;
}

// Plays a WAV into dictation as if it came from the microphone, in real time: for demos, and for
// simulators and tests where there is no microphone to speak into.
export function createClipRecorder({ load, chunkMs = 100, ...options }: IClipRecorderOptions): INativeRecorder {
  const pipeline = createRecorderPipeline(options);
  let timer: ReturnType<typeof setInterval> | null = null;
  let attempt = 0;

  const halt = (): void => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  return {
    pcm: pipeline.pcm,
    get isRecording() {
      return pipeline.isRecording;
    },
    async startRecording() {
      attempt += 1;
      const current = attempt;
      const clip = decodeWav(await load());

      if (clip === null) {
        throw new Error("The clip is not a WAV file");
      }

      if (current !== attempt) {
        return;
      }

      halt();
      pipeline.begin();
      const step = Math.round((clip.sampleRate * chunkMs) / 1000);
      let offset = 0;

      timer = setInterval(() => {
        const next = clip.samples.subarray(offset, offset + step);
        offset += step;
        pipeline.take(next.length === step ? next : new Float32Array(step), clip.sampleRate);
      }, chunkMs);
    },
    async stopRecording() {
      attempt += 1;
      halt();
      const recording = pipeline.finish();

      if (recording === null) {
        throw new Error("Not recording");
      }

      return recording;
    },
    readLevels: pipeline.readLevels,
    setBands: pipeline.setBands,
  };
}
