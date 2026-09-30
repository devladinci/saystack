import type { ISpeechPosition } from "@saystack/core";
import { useEffect, useState } from "react";

import type { ISpeechHookResult } from "./useSpeech.js";

const isSamePosition = (a: ISpeechPosition, b: ISpeechPosition, stepSeconds: number): boolean =>
  a.chunkIndex === b.chunkIndex &&
  a.wordIndex === b.wordIndex &&
  a.duration === b.duration &&
  Math.abs(a.time - b.time) < stepSeconds;

export function useSpeechProgress([state, api]: ISpeechHookResult, stepSeconds = 0.25): ISpeechPosition {
  const [position, setPosition] = useState<ISpeechPosition>(() => api.position());
  const isPlaying = state.phase === "playing";

  useEffect(() => {
    setPosition(api.position());

    if (!isPlaying) {
      return;
    }

    let frame = 0;

    const tick = (): void => {
      const next = api.position();
      setPosition((previous) => (isSamePosition(previous, next, stepSeconds) ? previous : next));
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [api, isPlaying, state, stepSeconds]);

  return position;
}
