import type { IAuraStyle } from "@saystack/core";
import { tokenizeWords } from "@saystack/core";
import type { IPlayerLabels, ISpeechHookResult } from "@saystack/react";
import { DEFAULT_PLAYER_LABELS, estimateDurations, formatClock, useSpeechProgress } from "@saystack/react";
import type { SpectrumLineState } from "@saystack/web";
import { useEffect } from "react";

import { SpectrumLine } from "../SpectrumLine.js";
import type { PlayerIconName } from "./PlayerIcon.js";
import { PlayerIcon } from "./PlayerIcon.js";
import { PlayerTicker } from "./PlayerTicker.js";
import { PlayerTrack } from "./PlayerTrack.js";

interface IProps {
  speech: ISpeechHookResult;
  levels?: (() => ArrayLike<number> | undefined) | undefined;
  style?: Partial<IAuraStyle> | undefined;
  labels?: Partial<IPlayerLabels> | undefined;
  autoHideMs?: number | undefined;
  onLocate?: (() => void) | undefined;
  onClose?: (() => void) | undefined;
  className?: string | undefined;
}

const RESTART_AFTER_SECONDS = 1.5;

const DEFAULT_AUTO_HIDE_MS = 30_000;

export default function SpeechPlayer({
  speech,
  levels,
  style,
  labels,
  autoHideMs = DEFAULT_AUTO_HIDE_MS,
  onLocate,
  onClose,
  className,
}: IProps) {
  const [state, api] = speech;
  const position = useSpeechProgress(speech);
  const text: IPlayerLabels = {
    ...DEFAULT_PLAYER_LABELS,
    ...labels,
    errors: { ...DEFAULT_PLAYER_LABELS.errors, ...labels?.errors },
  };
  const { phase, chunks, chunkIndex } = state;

  const handleClose = (): void => {
    if (onClose === undefined) {
      api.stop();
    } else {
      onClose();
    }
  };

  useEffect(() => {
    if (phase !== "done" || autoHideMs <= 0) {
      return;
    }

    const timer = setTimeout(onClose ?? api.stop, autoHideMs);

    return () => {
      clearTimeout(timer);
    };
  }, [phase, autoHideMs, onClose, api]);

  if (phase === "idle") {
    return null;
  }

  const chunk = chunks[chunkIndex];
  const words = chunk === undefined ? [] : tokenizeWords(chunk.text);
  const isInStep = position.chunkIndex === chunkIndex;
  const time = isInStep ? position.time : 0;
  const wordIndex = isInStep ? position.wordIndex : -1;
  const durations = estimateDurations(chunks);
  const elapsed = durations.slice(0, Math.max(0, chunkIndex)).reduce((sum, seconds) => sum + seconds, 0) + time;
  const total = durations.reduce((sum, seconds) => sum + seconds, 0);
  const isEnded = phase === "done" || phase === "error";

  const primary: Record<typeof phase, [PlayerIconName, string]> = {
    loading: ["pause", text.stop],
    playing: ["pause", text.pause],
    paused: ["play", text.resume],
    done: ["replay", text.replay],
    error: ["replay", text.retry],
  };
  const [primaryIcon, primaryLabel] = primary[phase];
  const lineState: SpectrumLineState = phase === "playing" ? "live" : phase === "loading" ? "working" : "still";

  const handlePrimary = (): void => {
    if (phase === "playing") {
      api.pause();
    } else if (phase === "paused") {
      api.resume();
    } else if (phase === "loading") {
      api.stop();
    } else {
      api.replay();
    }
  };

  const handlePrevious = (): void => {
    api.seek(time > RESTART_AFTER_SECONDS ? chunkIndex : Math.max(0, chunkIndex - 1));
  };

  const handleNext = (): void => {
    api.seek(chunkIndex + 1);
  };

  const handleSeek = (index: number): void => {
    api.seek(index);
  };

  const status = (): string | null => {
    if (phase === "loading" && chunkIndex < 0) {
      return text.preparing;
    }

    if (phase === "done") {
      return `${text.finished} · ${formatClock(total, true)}`;
    }

    if (phase === "error") {
      return (state.errorCode === null ? undefined : text.errors[state.errorCode]) ?? state.errorMessage ?? text.failed;
    }

    return null;
  };

  const message = status();

  return (
    <section
      className={className === undefined ? "saystack-player" : `saystack-player ${className}`}
      aria-label={text.region}
      data-phase={phase}
    >
      <div className="saystack-player__main">
        <button
          type="button"
          className="saystack-player__primary"
          aria-label={primaryLabel}
          title={primaryLabel}
          onClick={handlePrimary}
        >
          {phase === "loading" ? <span className="saystack-player__spinner" /> : <PlayerIcon name={primaryIcon} />}
        </button>
        <SpectrumLine className="saystack-player__spectrum" state={lineState} levels={levels} style={style} />
        <div className="saystack-player__now" aria-live="polite">
          {message === null ? (
            <PlayerTicker chunkIndex={chunkIndex} words={words} wordIndex={wordIndex} />
          ) : (
            <p className="saystack-player__status">{message}</p>
          )}
        </div>
        <div className="saystack-player__tools">
          <button
            type="button"
            className="saystack-player__button"
            aria-label={text.previous}
            title={text.previous}
            disabled={isEnded || chunkIndex < 0}
            onClick={handlePrevious}
          >
            <PlayerIcon name="previous" />
          </button>
          <button
            type="button"
            className="saystack-player__button"
            aria-label={text.next}
            title={text.next}
            disabled={isEnded || chunkIndex < 0 || chunkIndex >= chunks.length - 1}
            onClick={handleNext}
          >
            <PlayerIcon name="next" />
          </button>
          <span className="saystack-player__time">
            {formatClock(elapsed)} / {formatClock(total, true)}
          </span>
          {onLocate !== undefined && (
            <button
              type="button"
              className="saystack-player__button"
              aria-label={text.locate}
              title={text.locate}
              onClick={onLocate}
            >
              <PlayerIcon name="locate" />
            </button>
          )}
          <button
            type="button"
            className="saystack-player__button"
            aria-label={text.close}
            title={text.close}
            onClick={handleClose}
          >
            <PlayerIcon name="close" />
          </button>
        </div>
      </div>
      <PlayerTrack
        chunks={chunks}
        chunkIndex={chunkIndex}
        time={time}
        isDone={phase === "done"}
        labels={text}
        onSeek={handleSeek}
      />
    </section>
  );
}
