import type { IDictationInput, LiveTranscriptionFactory } from "@saystack/core";
import { startLiveTranscription } from "@saystack/core";
import type { IUseDictationOptions, IUseDictationResult } from "@saystack/react";
import { useDictation } from "@saystack/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { INativeRecorder } from "../audio/nativeRecorder.js";
import { createNativeRecorder } from "../audio/nativeRecorder.js";

export interface IRealtimeOptions {
  url: string | (() => string);
  language?: string;
  params?: Readonly<Record<string, unknown>>;
}

export interface IUseNativeDictationOptions extends Omit<IUseDictationOptions, "endpoint" | "recorder" | "live" | "input"> {
  endpoint: string;
  realtime?: IRealtimeOptions;
  recorder?: INativeRecorder;
  bands?: number;
  onInsert?: (text: string) => void;
}

export interface INativeDictation extends IUseDictationResult {
  liveText: string;
  isStreaming: boolean;
  readLevels: () => ArrayLike<number> | undefined;
}

// Streams while the engine allows it; the words then go into the draft through onInsert.
// Otherwise the recording is transcribed and handed to onText, or to onInsert when there is no onText.
export function useNativeDictation({ realtime, recorder: givenRecorder, bands, onInsert, ...options }: IUseNativeDictationOptions): INativeDictation {
  const [recorder] = useState(() => givenRecorder ?? createNativeRecorder(bands === undefined ? {} : { bands }));
  const [liveText, setLiveText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const realtimeRef = useRef(realtime);
  const onInsertRef = useRef(onInsert);

  useEffect(() => {
    realtimeRef.current = realtime;
    onInsertRef.current = onInsert;
  });

  useEffect(() => {
    if (bands !== undefined) {
      recorder.setBands(bands);
    }
  }, [recorder, bands]);

  const live = useCallback<LiveTranscriptionFactory>(
    (_active, onText) => {
      const current = realtimeRef.current;
      const url = current === undefined ? "" : typeof current.url === "function" ? current.url() : current.url;

      return startLiveTranscription({
        url,
        source: recorder.pcm,
        onText,
        onReady: () => setIsStreaming(true),
        ...(current?.language === undefined ? {} : { language: current.language }),
        ...(current?.params === undefined ? {} : { params: current.params }),
      });
    },
    [recorder],
  );

  const input = useMemo(
    (): IDictationInput => ({
      show: setLiveText,
      end: (text) => {
        setLiveText(text ?? "");

        if (text !== null) {
          onInsertRef.current?.(text);
        }
      },
    }),
    [],
  );

  const dictation = useDictation({ ...options, recorder, input, ...(realtime === undefined ? {} : { live }) });
  const { handlePressStart: startDictation } = dictation;

  const handlePressStart = useCallback(() => {
    setLiveText("");
    setIsStreaming(false);
    startDictation();
  }, [startDictation]);

  const readLevels = useCallback(() => recorder.readLevels(), [recorder]);

  return { ...dictation, handlePressStart, liveText, isStreaming, readLevels };
}
