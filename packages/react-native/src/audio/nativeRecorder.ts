import type { INativeRecording, IPcmSource, IPlatformRecorder } from "@saystack/core";
import type { AudioStream, AudioStreamBuffer } from "expo-audio";
import { AudioModule, requestRecordingPermissionsAsync, setAudioModeAsync } from "expo-audio";

import type { IRecorderPipelineOptions } from "./recorderPipeline.js";
import { createRecorderPipeline, PIPELINE_RATE } from "./recorderPipeline.js";

export type INativeRecorderOptions = IRecorderPipelineOptions;

export interface INativeRecorder extends IPlatformRecorder {
  readonly pcm: IPcmSource;
  readonly isRecording: boolean;
  stopRecording(): Promise<INativeRecording>;
  readLevels(): Float32Array | undefined;
  setBands(bands: number): void;
}

// Named like the browser's refusal, so saystack reports it as MIC_PERMISSION_DENIED on every platform.
const permissionDenied = (): Error => {
  const error = new Error("Microphone permission denied");
  error.name = "NotAllowedError";

  return error;
};

const firstChannel = (samples: Float32Array, channels: number): Float32Array =>
  Float32Array.from({ length: Math.floor(samples.length / channels) }, (_, index) => samples[index * channels] ?? 0);

// Streams the microphone through expo-audio for live transcription, and keeps the take for the others.
export function createNativeRecorder(options: INativeRecorderOptions = {}): INativeRecorder {
  const pipeline = createRecorderPipeline(options);
  let stream: AudioStream | null = null;
  let subscription: { remove(): void } | null = null;
  // A stop while the microphone is still opening wins: the stream is closed as soon as it opens.
  let attempt = 0;

  const take = (buffer: AudioStreamBuffer): void => {
    const raw = new Float32Array(buffer.data);
    pipeline.take(buffer.channels > 1 ? firstChannel(raw, buffer.channels) : raw, buffer.sampleRate);
  };

  const close = (): void => {
    const current = stream;
    stream = null;
    subscription?.remove();
    subscription = null;
    current?.stop();
    current?.release();
  };

  return {
    pcm: pipeline.pcm,
    get isRecording() {
      return pipeline.isRecording;
    },
    async startRecording() {
      attempt += 1;
      const current = attempt;
      const permission = await requestRecordingPermissionsAsync();

      if (!permission.granted) {
        throw permissionDenied();
      }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

      if (current !== attempt) {
        return;
      }

      pipeline.begin();
      const next = new AudioModule.AudioStream({ sampleRate: PIPELINE_RATE, channels: 1, encoding: "float32" });
      subscription = next.addListener("audioStreamBuffer", take);
      stream = next;

      try {
        await next.start();
      } catch (error: unknown) {
        close();
        pipeline.finish();
        throw error;
      }

      if (current !== attempt && stream === next) {
        close();
      }
    },
    async stopRecording(): Promise<INativeRecording> {
      attempt += 1;
      close();
      const recording = pipeline.finish();
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);

      if (recording === null) {
        throw new Error("Not recording");
      }

      return recording;
    },
    readLevels: pipeline.readLevels,
    setBands: pipeline.setBands,
  };
}
