import type { IStreamingInput } from "@saystack/web";
import { createStreamingInput } from "@saystack/web";
import type { RefObject } from "react";
import { useEffect, useLayoutEffect, useRef } from "react";

export interface IUseStreamingInputOptions {
  isStreaming: boolean;
  finalText: string;
  interimText?: string;
  onText?: (text: string) => void;
}

interface ISpokenText {
  finalText: string;
  interimText: string;
}

export function useStreamingInput(
  field: RefObject<HTMLTextAreaElement | HTMLInputElement | null>,
  { isStreaming, finalText, interimText = "", onText }: IUseStreamingInputOptions,
): void {
  const streamingRef = useRef<IStreamingInput | null>(null);
  const onTextRef = useRef(onText);
  const latestRef = useRef<ISpokenText>({ finalText, interimText });
  const shownRef = useRef("");

  // Layout effects run before passive cleanups, so the last words reach end().
  useLayoutEffect(() => {
    onTextRef.current = onText;
    latestRef.current = { finalText, interimText };
  });

  useEffect(() => {
    const element = field.current;

    if (!isStreaming || element === null) {
      return;
    }

    const streaming = createStreamingInput(element);
    streamingRef.current = streaming;
    shownRef.current = "";
    streaming.begin();

    return () => {
      streamingRef.current = null;
      streaming.update(latestRef.current.finalText, latestRef.current.interimText);
      const text = streaming.end();
      streaming.destroy();
      onTextRef.current?.(text);
    };
  }, [field, isStreaming]);

  useEffect(() => {
    const streaming = streamingRef.current;

    if (streaming === null) {
      return;
    }

    const spoken = `${finalText} ${interimText}`.trim();

    // Speech that starts over while still streaming is a new dictation: keep what came before.
    if (spoken === "" && shownRef.current !== "") {
      const kept = streaming.end();
      streaming.begin(kept);
      shownRef.current = "";
      onTextRef.current?.(kept);
      return;
    }

    shownRef.current = spoken;
    onTextRef.current?.(streaming.update(finalText, interimText));
  }, [isStreaming, finalText, interimText]);
}
