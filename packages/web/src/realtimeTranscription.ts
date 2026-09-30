import type { ILiveTranscription, IPcmSource } from "@saystack/core";
import { startLiveTranscription } from "@saystack/core";

import type { IPcmCapture } from "./pcmCapture.js";
import { capturePcm } from "./pcmCapture.js";

export interface IRealtimeTranscriptionOptions {
  url: string;
  stream: () => MediaStream | null;
  onText: (text: string) => void;
  language?: string;
  params?: Readonly<Record<string, unknown>>;
  context?: AudioContext;
  finishTimeoutMs?: number;
}

const STREAM_POLL_MS = 50;

// The microphone's stream exists only once it has opened, so it is polled until it appears.
const streamSource = (stream: () => MediaStream | null, context?: AudioContext): IPcmSource => ({
  start: (onChunk) => {
    let capture: IPcmCapture | null = null;
    let isStopped = false;

    const listen = (): void => {
      const live = stream();

      if (live !== null && capture === null && !isStopped) {
        clearInterval(poll);
        capture = capturePcm(live, context === undefined ? { onChunk } : { onChunk, context });
      }
    };

    const poll = setInterval(listen, STREAM_POLL_MS);
    listen();

    return () => {
      isStopped = true;
      clearInterval(poll);
      capture?.stop();
      capture = null;
    };
  },
});

export function startRealtimeTranscription({
  stream,
  context,
  ...options
}: IRealtimeTranscriptionOptions): ILiveTranscription {
  return startLiveTranscription({ ...options, source: streamSource(stream, context) });
}
