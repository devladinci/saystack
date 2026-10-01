import { getVoiceRecorder } from "@saystack/core";
import type { IAudioLevels } from "@saystack/web";
import { useEffect, useRef } from "react";

const STREAM_POLL_MS = 50;

const recorderStream = (): MediaStream | null => {
  const platform = getVoiceRecorder();

  return platform.ok ? (platform.recorder.stream ?? null) : null;
};

// The stream exists only once the microphone has opened, so it is polled until it appears.
export function useRecorderLevels(
  levels: IAudioLevels | null,
  isRecording: boolean,
  stream: () => MediaStream | null = recorderStream,
): void {
  const streamRef = useRef(stream);

  useEffect(() => {
    streamRef.current = stream;
  });

  useEffect(() => {
    if (levels === null || !isRecording) {
      return;
    }

    let disconnect: (() => void) | null = null;

    const connect = (): void => {
      const live = streamRef.current();

      if (live === null || disconnect !== null) {
        return;
      }

      levels.reset();
      disconnect = levels.listen(live);
      clearInterval(timer);
    };

    const timer = setInterval(connect, STREAM_POLL_MS);
    connect();

    return () => {
      clearInterval(timer);
      disconnect?.();
      levels.reset();
    };
  }, [levels, isRecording]);
}
