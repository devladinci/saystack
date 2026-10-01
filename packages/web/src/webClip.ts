import type { ISpeechClip } from "@saystack/core";
import { speechEnvelope } from "@saystack/core";

import { sharedAudioContext } from "./audioContext.js";

export interface IWebClipOptions {
  context?: AudioContext;
  output?: AudioNode;
}

export async function createWebClip(
  audio: ArrayBuffer,
  { context, output }: IWebClipOptions = {},
): Promise<ISpeechClip> {
  const audioContext = context ?? sharedAudioContext();
  const buffer = await audioContext.decodeAudioData(audio.slice(0));
  const destination = output ?? audioContext.destination;
  const envelope = speechEnvelope(buffer.getChannelData(0), buffer.sampleRate);
  let source: AudioBufferSourceNode | null = null;
  let offset = 0;
  let startedAt = 0;
  let hasEnded = false;
  let finish: (() => void) | null = null;

  const position = (): number =>
    source === null ? offset : Math.min(buffer.duration, offset + (audioContext.currentTime - startedAt));

  const settle = (): void => {
    const resolve = finish;
    finish = null;
    resolve?.();
  };

  const halt = (): void => {
    if (source === null) {
      return;
    }

    const node = source;
    source = null;
    node.onended = null;

    try {
      node.stop();
    } catch {
      // already stopped
    }

    node.disconnect();
  };

  const start = (): void => {
    const node = audioContext.createBufferSource();
    node.buffer = buffer;
    node.connect(destination);
    node.onended = () => {
      if (source !== node) {
        return;
      }

      source = null;
      offset = buffer.duration;
      hasEnded = true;
      node.disconnect();
      settle();
    };
    source = node;
    startedAt = audioContext.currentTime;
    node.start(0, Math.min(offset, buffer.duration));
  };

  return {
    duration: buffer.duration,
    envelope,
    get currentTime() {
      return position();
    },
    play: () =>
      new Promise<void>((resolve) => {
        halt();
        settle();
        finish = resolve;

        if (hasEnded) {
          offset = 0;
          hasEnded = false;
        }

        start();
      }),
    pause: () => {
      if (source === null) {
        return;
      }

      offset = position();
      halt();
    },
    resume: () => {
      if (source !== null || finish === null) {
        return;
      }

      start();
    },
    seek: (seconds) => {
      const isRunning = source !== null;
      halt();
      hasEnded = false;
      offset = Math.min(buffer.duration, Math.max(0, seconds));

      if (isRunning) {
        start();
      }
    },
    stop: () => {
      halt();
      settle();
    },
    release: () => {
      halt();
      settle();
    },
  };
}
