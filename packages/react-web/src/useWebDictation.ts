import type { LiveTranscriptionFactory } from "@saystack/core";
import type { IUseDictationOptions, IUseDictationResult } from "@saystack/react";
import { useDictation } from "@saystack/react";
import { createWebRecorder, sharedAudioContext, startRealtimeTranscription } from "@saystack/web";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAudioLevels } from "./useAudioLevels.js";
import { useRecorderLevels } from "./useRecorderLevels.js";

export interface IRealtimeOptions {
  url: string | (() => string);
  params?: Readonly<Record<string, unknown>>;
}

// recorder and live replace the microphone and the realtime socket, e.g. with a clip or the browser's own recognition.
export interface IUseWebDictationOptions extends IUseDictationOptions {
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
  recorder: customRecorder,
  live: customLive,
  ...options
}: IUseWebDictationOptions): IWebDictation {
  const [microphone] = useState(() =>
    createWebRecorder({
      ...(constraints === undefined ? {} : { constraints }),
      ...(mimeType === undefined ? {} : { mimeType }),
    }),
  );
  const recorder = customRecorder ?? microphone;
  const realtimeRef = useRef(realtime);
  const languageRef = useRef(options.language);
  const recorderRef = useRef(recorder);

  useEffect(() => {
    realtimeRef.current = realtime;
    languageRef.current = options.language;
    recorderRef.current = recorder;
  });

  const live = useCallback<LiveTranscriptionFactory>((active, onText) => {
    const current = realtimeRef.current;
    const url = current === undefined ? "" : typeof current.url === "function" ? current.url() : current.url;

    return startRealtimeTranscription({
      url,
      stream: () => active.stream ?? null,
      onText,
      context: sharedAudioContext(),
      ...(languageRef.current === undefined ? {} : { language: languageRef.current }),
      ...(current?.params === undefined ? {} : { params: current.params }),
    });
  }, []);

  const liveSource = customLive ?? (realtime === undefined ? undefined : live);
  const dictation = useDictation({ ...options, recorder, ...(liveSource === undefined ? {} : { live: liveSource }) });
  const levels = useAudioLevels(bands === undefined ? {} : { bands });
  const readLevels = useCallback(() => levels?.read(), [levels]);

  useRecorderLevels(levels, dictation.state === "recording", () => recorderRef.current.stream ?? null);

  return { ...dictation, readLevels };
}
