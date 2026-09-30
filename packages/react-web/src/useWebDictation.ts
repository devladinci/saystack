import type { LiveTranscriptionFactory } from "@saystack/core";
import type { IUseDictationOptions, IUseDictationResult } from "@saystack/react";
import { useDictation } from "@saystack/react";
import { createWebRecorder, sharedAudioContext, startRealtimeTranscription } from "@saystack/web";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAudioLevels } from "./useAudioLevels.js";
import { useRecorderLevels } from "./useRecorderLevels.js";

export interface IRealtimeOptions {
  url: string | (() => string);
  language?: string;
  params?: Readonly<Record<string, unknown>>;
}

export interface IUseWebDictationOptions extends Omit<IUseDictationOptions, "recorder" | "live"> {
  realtime?: IRealtimeOptions;
  constraints?: MediaTrackConstraints;
  mimeType?: string;
  bands?: number;
}

export interface IWebDictation extends IUseDictationResult {
  readLevels: () => ArrayLike<number> | undefined;
}

// Streams while the engine allows it; otherwise, or when the stream breaks off, the recording is transcribed.
export function useWebDictation({
  realtime,
  constraints,
  mimeType,
  bands,
  ...options
}: IUseWebDictationOptions): IWebDictation {
  const [recorder] = useState(() =>
    createWebRecorder({
      ...(constraints === undefined ? {} : { constraints }),
      ...(mimeType === undefined ? {} : { mimeType }),
    }),
  );
  const realtimeRef = useRef(realtime);

  useEffect(() => {
    realtimeRef.current = realtime;
  });

  const live = useCallback<LiveTranscriptionFactory>((active, onText) => {
    const current = realtimeRef.current;
    const url = current === undefined ? "" : typeof current.url === "function" ? current.url() : current.url;

    return startRealtimeTranscription({
      url,
      stream: () => active.stream ?? null,
      onText,
      context: sharedAudioContext(),
      ...(current?.language === undefined ? {} : { language: current.language }),
      ...(current?.params === undefined ? {} : { params: current.params }),
    });
  }, []);

  const dictation = useDictation({ ...options, recorder, ...(realtime === undefined ? {} : { live }) });
  const levels = useAudioLevels(bands === undefined ? {} : { bands });
  const readLevels = useCallback(() => levels?.read(), [levels]);

  useRecorderLevels(levels, dictation.state === "recording", () => recorder.stream ?? null);

  return { ...dictation, readLevels };
}
