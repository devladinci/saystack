import type { IWordToken } from "@saystack/core";
import { useLayoutEffect, useRef } from "react";

interface IProps {
  chunkIndex: number;
  words: readonly IWordToken[];
  wordIndex: number;
}

const FOLLOW_AT = 0.72;

const wordClass = (index: number, wordIndex: number): string => {
  if (index === wordIndex) {
    return "saystack-player__word saystack-player__word--now";
  }

  return index < wordIndex ? "saystack-player__word saystack-player__word--read" : "saystack-player__word";
};

export function PlayerTicker({ chunkIndex, words, wordIndex }: IProps) {
  const windowRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const frame = windowRef.current;
    const line = lineRef.current;

    if (frame === null || line === null) {
      return;
    }

    const current = line.children.item(Math.max(0, wordIndex));
    const overflow =
      current instanceof HTMLElement ? current.offsetLeft + current.offsetWidth - frame.clientWidth * FOLLOW_AT : 0;

    line.style.transform = `translateX(${-Math.max(0, overflow)}px)`;
  }, [chunkIndex, wordIndex]);

  return (
    <div ref={windowRef} className="saystack-player__ticker">
      <div ref={lineRef} className="saystack-player__line">
        {words.map((word, index) => (
          <span key={`${chunkIndex}:${word.charStart}`} className={wordClass(index, wordIndex)}>
            {word.text}
          </span>
        ))}
      </div>
    </div>
  );
}
