import type { LiveTranscriptionFactory } from "@saystack/core";

import type { IClip } from "../clips.js";

const STEP_MS = 50;

const heardBy = ({ text, marks }: IClip, seconds: number): string => {
  const count = marks.filter((mark) => mark.time <= seconds).length;
  const next = marks[count];

  return next === undefined ? text : text.slice(0, next.charIndex).trimEnd();
};

// Reveals the clip's words at the moments they are spoken, the way a streaming engine would.
export function clipTranscription(clip: IClip, elapsed: () => number): LiveTranscriptionFactory {
  return (_recorder, onText) => {
    let heard = "";

    const timer = setInterval(() => {
      const next = heardBy(clip, elapsed());

      if (next !== heard) {
        heard = next;
        onText(heard);
      }
    }, STEP_MS);

    return {
      isLive: true,
      finish: async () => {
        clearInterval(timer);

        return heard === "" ? null : heard;
      },
      cancel: () => {
        clearInterval(timer);
      },
    };
  };
}
