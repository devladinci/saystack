import type { ISpeechChunk } from "@saystack/core";
import type { IPlayerLabels } from "@saystack/react";
import { estimateDurations } from "@saystack/react";
import { useLayoutEffect, useRef } from "react";

interface IProps {
  chunks: readonly ISpeechChunk[];
  chunkIndex: number;
  time: number;
  isDone: boolean;
  labels: IPlayerLabels;
  onSeek: (chunkIndex: number) => void;
}

const MIN_SHARE = 0.4;

const fillOf = (index: number, chunkIndex: number, time: number, chunk: ISpeechChunk, isDone: boolean): number => {
  if (isDone || index < chunkIndex) {
    return 1;
  }

  if (index > chunkIndex || chunk.duration <= 0) {
    return 0;
  }

  return Math.min(1, Math.max(0, time / chunk.duration));
};

const textOffsets = (chunks: readonly ISpeechChunk[]): number[] => {
  let offset = 0;

  return chunks.map((chunk) => {
    const start = offset;
    offset += chunk.text.length + 1;

    return start;
  });
};

export function PlayerTrack({ chunks, chunkIndex, time, isDone, labels, onSeek }: IProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const offsets = textOffsets(chunks);

  useLayoutEffect(() => {
    const track = trackRef.current;

    if (track === null) {
      return;
    }

    const weights = estimateDurations(chunks).map((seconds) => Math.max(MIN_SHARE, seconds));
    const segments = track.querySelectorAll<HTMLElement>(".saystack-player__segment");

    segments.forEach((segment, index) => {
      const chunk = chunks[index];
      segment.style.flexGrow = String(weights[index] ?? 1);
      const fill = segment.firstElementChild;

      if (fill instanceof HTMLElement && chunk !== undefined) {
        fill.style.transform = `scaleX(${fillOf(index, chunkIndex, time, chunk, isDone).toFixed(3)})`;
      }
    });
  }, [chunks, chunkIndex, time, isDone]);

  return (
    <div ref={trackRef} className="saystack-player__track">
      {chunks.map((chunk, index) => (
        <button
          key={offsets[index]}
          type="button"
          className={
            index === chunkIndex ? "saystack-player__segment saystack-player__segment--now" : "saystack-player__segment"
          }
          aria-label={labels.part(index + 1, chunks.length)}
          title={chunk.text}
          onClick={() => onSeek(index)}
        >
          <span className="saystack-player__fill" />
        </button>
      ))}
    </div>
  );
}
