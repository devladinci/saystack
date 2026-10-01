import type { DictationState } from "@saystack/react";
import { useEffect, useRef, useState } from "react";

export type DictationPhase = "hidden" | "listening" | "working" | "dropping" | "notice";

const DROP_MS = 380;

const NOTICE_MS = 1600;

// The spotlight outlives the dictation for a moment: the words drop into the draft, or an error is read.
export function useDictationPhase(state: DictationState, hasWords: boolean, isTooShort: boolean): DictationPhase {
  const [ending, setEnding] = useState<"dropping" | "notice" | null>(null);
  const previousRef = useRef(state);
  const hasWordsRef = useRef(hasWords);

  useEffect(() => {
    hasWordsRef.current = hasWords;
  });

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = state;

    if (state === "recording") {
      setEnding(null);
      return;
    }

    if (state === "done" && previous === "transcribing" && hasWordsRef.current) {
      setEnding("dropping");
      const timer = setTimeout(() => setEnding(null), DROP_MS);

      return () => clearTimeout(timer);
    }

    if (state === "error" && previous !== "error") {
      setEnding("notice");
      const timer = setTimeout(() => setEnding(null), NOTICE_MS);

      return () => clearTimeout(timer);
    }

    return undefined;
  }, [state]);

  if (state === "recording") {
    return "listening";
  }

  if (state === "transcribing") {
    return "working";
  }

  if (ending !== null) {
    return ending;
  }

  return isTooShort ? "notice" : "hidden";
}
