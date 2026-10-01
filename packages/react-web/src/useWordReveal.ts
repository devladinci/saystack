import { useEffect, useState } from "react";

export interface IWordReveal {
  finalText: string;
  interimText: string;
  isRevealing: boolean;
}

const INTERIM_WORDS = 2;

export function useWordReveal(text: string, wordsPerSecond = 14): IWordReveal {
  const words = text.trim() === "" ? [] : text.trim().split(/\s+/);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    setShown(0);

    if (words.length === 0) {
      return;
    }

    const started = performance.now();
    let frame = 0;

    const tick = (now: number): void => {
      const next = Math.min(words.length, Math.floor(((now - started) / 1000) * wordsPerSecond) + 1);
      setShown(next);

      if (next < words.length) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [text, words.length, wordsPerSecond]);

  const settled = Math.max(0, shown - INTERIM_WORDS);
  const isRevealing = shown < words.length;

  return {
    finalText: words.slice(0, isRevealing ? settled : shown).join(" "),
    interimText: isRevealing ? words.slice(settled, shown).join(" ") : "",
    isRevealing,
  };
}
