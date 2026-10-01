import type { IPlatformRecorder } from "@saystack/core";
import { sharedAudioContext } from "@saystack/web";

import type { IClip } from "../clips.js";
import { loadClip } from "../clips.js";

export interface IClipRecorder extends IPlatformRecorder {
  elapsed(): number;
}

// Plays a recorded voice as if it came from the microphone: out loud, and as the stream the levels listen to.
export function createClipRecorder(clip: IClip, onEnded: () => void): IClipRecorder {
  let stream: MediaStream | null = null;
  let source: AudioBufferSourceNode | null = null;
  let startedAt = 0;

  const halt = (): void => {
    if (source === null) {
      return;
    }

    source.onended = null;
    source.stop();
    source.disconnect();
    source = null;
  };

  return {
    get stream() {
      return stream;
    },

    elapsed() {
      return source === null ? 0 : sharedAudioContext().currentTime - startedAt;
    },

    async startRecording() {
      const context = sharedAudioContext();
      await context.resume();
      const buffer = await context.decodeAudioData(await loadClip(clip.file).then((audio) => audio.slice(0)));
      const destination = context.createMediaStreamDestination();
      const next = context.createBufferSource();
      next.buffer = buffer;
      next.connect(destination);
      next.connect(context.destination);
      next.onended = onEnded;
      stream = destination.stream;
      source = next;
      startedAt = context.currentTime;
      next.start();
    },

    async stopRecording() {
      halt();
      stream = null;
      const audio = await loadClip(clip.file);

      return { blob: new Blob([audio], { type: "audio/mp4" }) };
    },
  };
}
