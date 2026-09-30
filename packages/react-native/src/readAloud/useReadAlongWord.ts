import type { ISpeechHookResult } from "@saystack/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { IReadingText } from "./readAlongMap.js";
import { mapReadAlong, pageWordAt, seekFor } from "./readAlongMap.js";

export interface IReadAlongWord {
  activeWord: number;
  seekTo: (wordIndex: number) => void;
}

// Follows the voice word by word; a spoken word that is not on the page keeps the last one that is.
export function useReadAlongWord([state, api]: ISpeechHookResult, text: IReadingText): IReadAlongWord {
  const [activeWord, setActiveWord] = useState(-1);
  const map = useMemo(() => mapReadAlong(state.chunks, text.words), [state.chunks, text.words]);
  const isFollowing = state.phase === "playing" || state.phase === "paused";

  useEffect(() => {
    if (!isFollowing) {
      setActiveWord(-1);
      return;
    }

    setActiveWord(pageWordAt(map, api.position()));

    if (state.phase === "paused") {
      return;
    }

    let frame = 0;

    const tick = (): void => {
      const next = pageWordAt(map, api.position());
      setActiveWord((previous) => (previous === next ? previous : next));
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [map, api, isFollowing, state.phase]);

  const seekTo = useCallback(
    (wordIndex: number) => {
      const target = seekFor(map, state.chunks, wordIndex);

      if (target === null) {
        return;
      }

      api.seek(target.chunkIndex, target.seconds);

      if (state.phase === "paused") {
        api.resume();
      }
    },
    [map, api, state.chunks, state.phase],
  );

  return { activeWord, seekTo };
}
