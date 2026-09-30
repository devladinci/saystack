export { dictationEndpoint, sendDictation } from "./dictationSender.js";
export { useDictation } from "./useDictation.js";
export type { ISpeechApi, ISpeechHookResult } from "./useSpeech.js";
export { createSpeechApi, useSpeech } from "./useSpeech.js";
export { useSpeechProgress } from "./useSpeechProgress.js";
export type { IReadAloudSnapshot, IReadAloudStore, IReadAloudView, ReadAloudId } from "./readAloud/readAloudStore.js";
export { createReadAloudStore } from "./readAloud/readAloudStore.js";
export type {
  ICreateReadAloudOptions,
  IReadAloudSources,
  RewriteFn,
  SummarizeFn,
} from "./readAloud/createReadAloud.js";
export { createReadAloud } from "./readAloud/createReadAloud.js";
export { estimateDurations } from "./player/estimateDurations.js";
export { formatClock } from "./player/formatClock.js";
export type { IPlayerLabels } from "./player/labels.js";
export { DEFAULT_PLAYER_LABELS } from "./player/labels.js";
export type {
  DictationState,
  IDictationSendOptions,
  IUseDictationOptions,
  IUseDictationResult,
  TranscribeFn,
} from "./types.js";
export type {
  IDictationInput,
  ILiveTranscription,
  LiveTranscriptionFactory,
  INativeRecording,
  IPlatformRecorder,
  IVoiceRecording,
  IVoiceRecorderResult,
  IWebRecording,
} from "@saystack/core";
export { setVoiceRecorder, getVoiceRecorder } from "@saystack/core";
export type {
  ISpeechChunk,
  ISpeechClip,
  ISpeechClipResult,
  ISpeechPosition,
  ISpeechSessionOptions,
  ISpeechState,
  ITtsDriver,
  TtsErrorCode,
  TtsPhase,
} from "@saystack/core";
