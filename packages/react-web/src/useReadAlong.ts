import type { ISpeechHookResult } from "@saystack/react";
import type { IReadAlong } from "@saystack/web";
import { createReadAlong } from "@saystack/web";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";

export interface IUseReadAlongOptions {
  isActive: boolean;
  isDimmed?: boolean;
  blocks?: string;
  zIndex?: number;
}

export function useReadAlong(
  root: RefObject<Element | null>,
  [state, api]: ISpeechHookResult,
  { isActive, isDimmed = true, blocks, zIndex }: IUseReadAlongOptions,
): void {
  const [readAlong, setReadAlong] = useState<IReadAlong | null>(null);
  const isDimmedRef = useRef(isDimmed);

  useEffect(() => {
    isDimmedRef.current = isDimmed;
    readAlong?.setDimmed(isDimmed);
  }, [readAlong, isDimmed]);

  useEffect(() => {
    const element = root.current;

    if (!isActive || element === null) {
      return;
    }

    const next = createReadAlong(element, {
      isDimmed: isDimmedRef.current,
      ...(blocks === undefined ? {} : { blocks }),
      ...(zIndex === undefined ? {} : { zIndex }),
      onSeek: ({ chunkIndex, seconds }) => {
        api.seek(chunkIndex, seconds);
      },
    });
    setReadAlong(next);

    return () => {
      next.destroy();
      setReadAlong(null);
    };
  }, [root, isActive, blocks, zIndex, api]);

  useEffect(() => {
    readAlong?.setChunks(state.chunks);
  }, [readAlong, state.chunks]);

  useEffect(() => {
    if (readAlong === null) {
      return;
    }

    if (state.phase === "done") {
      readAlong.finish();
      return;
    }

    if (state.phase !== "playing" && state.phase !== "paused") {
      return;
    }

    readAlong.setPosition(api.position());

    if (state.phase === "paused") {
      return;
    }

    let frame = 0;

    const tick = (): void => {
      readAlong.setPosition(api.position());
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [readAlong, state, api]);
}
