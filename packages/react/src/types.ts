import type {
  IDictationInput,
  IPlatformRecorder,
  ISttTranscribeResult,
  IVoiceRecording,
  LiveTranscriptionFactory,
  RequestHeaders,
  SttErrorCode,
} from "@saystack/core";

export type DictationState = "idle" | "recording" | "transcribing" | "done" | "error";

export interface IDictationSendOptions {
  prompt?: string;
  language?: string;
  context?: string;
  signal?: AbortSignal;
  headers?: RequestHeaders;
}

export type TranscribeFn = (recording: IVoiceRecording, signal: AbortSignal) => Promise<ISttTranscribeResult>;

export interface IUseDictationOptions {
  endpoint?: string;
  headers?: RequestHeaders;
  prompt?: string;
  // A hint for what is being spoken, sent with the upload and to the live stream.
  language?: string;
  // What the conversation has been about, such as the last few messages. A server that cleans transcripts
  // up reads it to recognise names and terms the engine misheard; it is sent with the upload and to the live stream.
  context?: string;
  recorder?: IPlatformRecorder;
  transcribe?: TranscribeFn;
  live?: LiveTranscriptionFactory;
  input?: IDictationInput;
  onText?: (text: string) => void;
}

export interface IUseDictationResult {
  state: DictationState;
  isSupported: boolean;
  text: string;
  errorCode?: SttErrorCode;
  errorMessage?: string;
  handlePressStart: () => void;
  handlePressEnd: () => void;
  handleCancel: () => void;
}
