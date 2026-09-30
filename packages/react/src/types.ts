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
  signal?: AbortSignal;
  headers?: RequestHeaders;
}

export type TranscribeFn = (recording: IVoiceRecording, signal: AbortSignal) => Promise<ISttTranscribeResult>;

export interface IUseDictationOptions {
  endpoint?: string;
  headers?: RequestHeaders;
  prompt?: string;
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
