import type { SttErrorCode } from "./stt.js";

export interface IWebRecording {
  blob: Blob;
}

export interface INativeRecording {
  uri: string;
  mimeType: string;
}

export type IVoiceRecording = IWebRecording | INativeRecording;

export interface IPlatformRecorder {
  readonly stream?: MediaStream | null;
  startRecording(): Promise<void>;
  stopRecording(): Promise<IVoiceRecording>;
}

export type IVoiceRecorderResult = { ok: true; recorder: IPlatformRecorder } | { ok: false; errorCode: SttErrorCode };

let recorder: IPlatformRecorder | undefined;

export function setVoiceRecorder(next: IPlatformRecorder): void {
  recorder = next;
}

export function getVoiceRecorder(): IVoiceRecorderResult {
  return recorder ? { ok: true, recorder } : { ok: false, errorCode: "NO_PLATFORM" };
}
