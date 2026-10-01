import type { ISpeechMark, ITtsDriver } from "@saystack/core";

import manifest from "./clips.json";

export interface IClip {
  text: string;
  file: string;
  duration: number;
  marks: readonly ISpeechMark[];
}

const FIRST_AUDIO_DELAY_MS = 1200;
const NEW_READING_AFTER_MS = 3000;

const audioCache = new Map<string, Promise<ArrayBuffer>>();

export const DICTATION_CLIP: IClip = manifest.dictation;

const replyClips = new Map<string, IClip>(manifest.replies.map((clip) => [clip.text, clip]));

export function loadClip(file: string): Promise<ArrayBuffer> {
  const cached = audioCache.get(file);

  if (cached !== undefined) {
    return cached;
  }

  const loading = fetch(`${import.meta.env.BASE_URL}clips/${file}`).then((response) => {
    if (!response.ok) {
      throw new Error(`clip ${file} answered ${response.status}`);
    }

    return response.arrayBuffer();
  });
  audioCache.set(file, loading);
  loading.catch(() => audioCache.delete(file));

  return loading;
}

const wait = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });

// Answers like an engine would, optionally as slowly as one does before the first audio of a reading.
export function createClipSynthesize(hasLatency: () => boolean): ITtsDriver["synthesize"] {
  let lastCallAt = Number.NEGATIVE_INFINITY;

  return async ({ text, signal }) => {
    const clip = replyClips.get(text);

    if (clip === undefined) {
      return { ok: false, errorCode: "TTS_FAILED", message: "There is no recording of this text." };
    }

    const now = performance.now();
    const isNewReading = now - lastCallAt > NEW_READING_AFTER_MS;
    lastCallAt = now;

    if (isNewReading && hasLatency()) {
      await wait(FIRST_AUDIO_DELAY_MS, signal);
    }

    try {
      const audio = await loadClip(clip.file);

      return { ok: true, audio: audio.slice(0), mimeType: "audio/mp4", marks: clip.marks };
    } catch (error) {
      return { ok: false, errorCode: "TTS_UNAVAILABLE", message: error instanceof Error ? error.message : "no clip" };
    }
  };
}
