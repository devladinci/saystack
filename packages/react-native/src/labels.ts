import type { SttErrorCode } from "@saystack/core";
import type { IPlayerLabels } from "@saystack/react";
import { DEFAULT_PLAYER_LABELS } from "@saystack/react";

export interface IDictationLabels {
  listening: string;
  releaseToInsert: string;
  releaseToSend: string;
  releaseToCancel: string;
  transcribing: string;
  holdToTalk: string;
  errors: Partial<Record<SttErrorCode, string>>;
  failed: string;
}

export interface IReadAloudLabels extends IPlayerLabels {
  reading: string;
  readingSummary: string;
  paused: string;
  summary: string;
}

export const DEFAULT_DICTATION_LABELS: IDictationLabels = {
  listening: "Listening…",
  releaseToInsert: "Release to add it to your message",
  releaseToSend: "Release to send",
  releaseToCancel: "Release to cancel",
  transcribing: "Transcribing…",
  holdToTalk: "Hold to talk",
  errors: {
    MIC_PERMISSION_DENIED: "Microphone access is off. Turn it on in Settings.",
    MIC_UNAVAILABLE: "The microphone isn't available.",
    EMPTY_AUDIO: "Didn't catch that. Try again.",
    RECORDING_TOO_SHORT: "Didn't catch that. Try again.",
    ENGINE_UNAVAILABLE: "Can't reach the transcription engine.",
    MODEL_NOT_FOUND: "The transcription model isn't available.",
    TIMEOUT: "Transcription took too long.",
  },
  failed: "Transcription failed.",
};

export const DEFAULT_READ_ALOUD_LABELS: IReadAloudLabels = {
  ...DEFAULT_PLAYER_LABELS,
  reading: "Reading reply",
  readingSummary: "Reading a summary",
  paused: "Paused",
  summary: "Summary",
};

export function dictationLabels(labels: Partial<IDictationLabels> = {}): IDictationLabels {
  return { ...DEFAULT_DICTATION_LABELS, ...labels, errors: { ...DEFAULT_DICTATION_LABELS.errors, ...labels.errors } };
}

export function readAloudLabels(labels: Partial<IReadAloudLabels> = {}): IReadAloudLabels {
  return { ...DEFAULT_READ_ALOUD_LABELS, ...labels, errors: { ...DEFAULT_READ_ALOUD_LABELS.errors, ...labels.errors } };
}
