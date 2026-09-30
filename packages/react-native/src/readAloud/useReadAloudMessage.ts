import type { TtsPhase } from "@saystack/core";
import type { ReadAloudId } from "@saystack/react";
import type { RefObject } from "react";
import { useCallback, useEffect, useSyncExternalStore } from "react";

import type { IMeasurable } from "../measure.js";
import { useReadAloudStore } from "./useReadAloudStore.js";

export interface IReadAloudMessage {
  phase: TtsPhase;
  isActive: boolean;
  isLoading: boolean;
  isSummary: boolean;
  speak: (markdown: string) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
}

// With an anchor, the spotlight lifts the reply from where it sits on screen.
export function useReadAloudMessage(id: ReadAloudId, anchor?: RefObject<IMeasurable | null>): IReadAloudMessage {
  const store = useReadAloudStore();
  const view = useSyncExternalStore(
    store.subscribe,
    () => store.viewOf(id),
    () => store.viewOf(id),
  );
  const { phase, isSummary } = view;

  useEffect(() => {
    const target = anchor?.current ?? null;

    if (target === null) {
      return;
    }

    return store.register(id, target);
  }, [store, id, anchor]);

  const speak = useCallback((markdown: string) => store.speak(id, markdown), [store, id]);

  return {
    phase,
    isActive: phase === "loading" || phase === "playing" || phase === "paused",
    isLoading: phase === "loading",
    isSummary,
    speak,
    stop: store.api.stop,
    pause: store.api.pause,
    resume: store.api.resume,
  };
}
