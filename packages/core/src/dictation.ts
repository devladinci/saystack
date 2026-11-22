import type { IPlatformRecorder } from "./platform.js";

export interface IDictationInput {
  show(text: string): void;
  // The speaker has stopped and the final text is on its way: the shown words are not settled yet.
  wait?(): void;
  // null takes the dictated words back out.
  end(text: string | null): void;
}

export interface ILiveTranscription {
  readonly isLive: boolean;
  // null when the stream could not deliver the whole text; transcribe the recording instead.
  finish(): Promise<string | null>;
  cancel(): void;
}

export type LiveTranscriptionFactory = (
  recorder: IPlatformRecorder,
  onText: (text: string) => void,
) => ILiveTranscription;
