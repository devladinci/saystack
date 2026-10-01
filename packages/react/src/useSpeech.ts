import type { ISpeechPosition, ISpeechSession, ISpeechSessionOptions, ISpeechState, ITtsDriver } from "@saystack/core";
import { createSpeechSession } from "@saystack/core";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

export interface ISpeechApi {
  speak: (markdown: string, refAudio?: string, refText?: string) => Promise<void>;
  stop: () => void;
  replay: () => void;
  pause: () => void;
  resume: () => void;
  seek: (chunkIndex: number, seconds?: number) => void;
  position: () => ISpeechPosition;
}

export type ISpeechHookResult = readonly [state: ISpeechState, api: ISpeechApi];

interface ISessionHandle {
  session: ISpeechSession;
  driver: ITtsDriver;
}

export function createSpeechApi(session: ISpeechSession, driver: ITtsDriver): ISpeechApi {
  return {
    speak: async (markdown, refAudio, refText) => {
      driver.unlock?.();
      const speechOptions = refAudio !== undefined && refText !== undefined ? { refAudio, refText } : {};

      await session.speak(markdown, speechOptions);
    },
    stop: () => session.stop(),
    replay: () => {
      driver.unlock?.();
      session.replay();
    },
    pause: () => session.pause(),
    resume: () => {
      driver.unlock?.();
      session.resume();
    },
    seek: (chunkIndex, seconds) => session.seek(chunkIndex, seconds),
    position: () => session.position(),
  };
}

// The session is created once; later options are read when speech starts, so
// callers may pass fresh functions on every render.
export function useSpeech(driver: ITtsDriver, options?: ISpeechSessionOptions): ISpeechHookResult {
  const optionsRef = useRef(options);
  const handleRef = useRef<ISessionHandle | null>(null);

  useEffect(() => {
    optionsRef.current = options;
  });

  if (handleRef.current === null) {
    handleRef.current = {
      driver,
      session: createSpeechSession(driver, {
        get rewrite() {
          return optionsRef.current?.rewrite;
        },
        get shouldRewrite() {
          return optionsRef.current?.shouldRewrite;
        },
      }),
    };
  }

  const { session, driver: sessionDriver } = handleRef.current;

  const subscribe = useCallback((listener: () => void) => session.subscribe(listener), [session]);
  const getSnapshot = useCallback((): ISpeechState => session.state, [session]);

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const api = useMemo((): ISpeechApi => createSpeechApi(session, sessionDriver), [session, sessionDriver]);

  useEffect(() => {
    return () => {
      session.stop();
    };
  }, [session]);

  return [state, api];
}
