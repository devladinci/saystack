import type { LiveTranscriptionFactory } from "@saystack/core";

interface IRecognitionAlternative {
  transcript: string;
}

interface IRecognitionResult {
  readonly isFinal: boolean;
  readonly [index: number]: IRecognitionAlternative | undefined;
}

interface IRecognitionEvent {
  readonly results: ArrayLike<IRecognitionResult>;
}

interface IRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: IRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionConstructor = new () => IRecognition;

interface IRecognitionWindow {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
}

const FINISH_TIMEOUT_MS = 1500;

const recognitionClass = (): RecognitionConstructor | undefined => {
  const scope = window as unknown as IRecognitionWindow;

  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
};

export const hasBrowserRecognition = (): boolean => typeof window !== "undefined" && recognitionClass() !== undefined;

const transcriptOf = (results: ArrayLike<IRecognitionResult>): string =>
  Array.from(results)
    .map((result) => result[0]?.transcript ?? "")
    .join("")
    .trim();

// The browser's own speech recognition, as a live source for useWebDictation. Where there is none, the recording
// is handed to transcribe instead.
export function browserRecognition(): LiveTranscriptionFactory {
  return (_recorder, onText) => {
    const Recognition = recognitionClass();

    if (Recognition === undefined) {
      return { isLive: false, finish: async () => null, cancel: () => undefined };
    }

    const recognition = new Recognition();
    let heard = "";
    let markEnded = (): void => undefined;
    const ended = new Promise<void>((resolve) => {
      markEnded = resolve;
    });

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language;
    recognition.onresult = ({ results }) => {
      heard = transcriptOf(results);
      onText(heard);
    };
    recognition.onend = markEnded;
    recognition.onerror = markEnded;
    recognition.start();

    return {
      isLive: true,
      finish: async () => {
        recognition.stop();
        await Promise.race([ended, new Promise((resolve) => setTimeout(resolve, FINISH_TIMEOUT_MS))]);

        return heard === "" ? null : heard;
      },
      cancel: () => {
        recognition.abort();
      },
    };
  };
}
