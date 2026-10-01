import type { TtsPhase } from "@saystack/core";
import type { RefObject } from "react";
import { useCallback, useEffect, useSyncExternalStore } from "react";

import type { ReadAloudId } from "@saystack/react";
import { useReadAlong } from "./useReadAlong.js";
import { useReadAloudStore } from "./useReadAloudStore.js";

export interface IReadAloudMessage {
  phase: TtsPhase;
  isActive: boolean;
  isLoading: boolean;
  speak: (markdown: string) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
}

export interface IReadAloudMessageOptions {
  // Stacking of the word and block marks; see IReadAlongOptions.zIndex.
  zIndex?: number;
}

const NO_ROOT: RefObject<Element | null> = { current: null };

// With a root, the words are marked while they are read and the glow gathers around it.
export function useReadAloudMessage(
  id: ReadAloudId,
  root?: RefObject<Element | null>,
  { zIndex }: IReadAloudMessageOptions = {},
): IReadAloudMessage {
  const store = useReadAloudStore();
  const view = useSyncExternalStore(
    store.subscribe,
    () => store.viewOf(id),
    () => store.viewOf(id),
  );
  const { phase, isSummary, speech } = view;

  useEffect(() => {
    const element = root?.current ?? null;

    if (element === null) {
      return;
    }

    return store.register(id, element);
  }, [store, id, root]);

  useReadAlong(root ?? NO_ROOT, speech, {
    isActive: root !== undefined && phase !== "idle" && !isSummary,
    ...(zIndex === undefined ? {} : { zIndex }),
  });

  const speak = useCallback((markdown: string) => store.speak(id, markdown), [store, id]);

  return {
    phase,
    isActive: phase === "loading" || phase === "playing" || phase === "paused",
    isLoading: phase === "loading",
    speak,
    stop: store.api.stop,
    pause: store.api.pause,
    resume: store.api.resume,
  };
}
