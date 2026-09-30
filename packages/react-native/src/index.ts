export type { AuraOutline, IAuraOutlineRect } from "./AuraView.js";
export { AuraView } from "./AuraView.js";
export { SpotlightBackdrop } from "./SpotlightBackdrop.js";
export type { SpotlightContainer } from "./spotlightContainer.js";

export { default as DictationSpotlight } from "./DictationSpotlight/index.js";
export { default as LiveCaptions } from "./LiveCaptions/index.js";
export type { IHoldToTalk, IUseHoldToTalkOptions, HoldToTalkHandlers } from "./dictation/useHoldToTalk.js";
export { useHoldToTalk } from "./dictation/useHoldToTalk.js";
export type { INativeDictation, IRealtimeOptions, IUseNativeDictationOptions } from "./dictation/useNativeDictation.js";
export { useNativeDictation } from "./dictation/useNativeDictation.js";

export { ReadAloudProvider } from "./readAloud/ReadAloudProvider.js";
export type { IReadAloud } from "./readAloud/useReadAloud.js";
export { useReadAloud } from "./readAloud/useReadAloud.js";
export type { IReadAloudMessage } from "./readAloud/useReadAloudMessage.js";
export { useReadAloudMessage } from "./readAloud/useReadAloudMessage.js";
export type { IReadAlongWord } from "./readAloud/useReadAlongWord.js";
export { useReadAlongWord } from "./readAloud/useReadAlongWord.js";
export type { IReadingText, IReadingWord } from "./readAloud/readAlongMap.js";
export { readingText } from "./readAloud/readAlongMap.js";
export { default as ReadAloudSpotlight } from "./ReadAloudSpotlight/index.js";
export type { PlayerIconRenderer } from "./ReadAloudPlayer/index.js";
export { default as ReadAloudPlayer } from "./ReadAloudPlayer/index.js";
export type { PlayerIconName } from "./ReadAloudPlayer/PlayerIcon.js";
export { default as ReadAlongText } from "./ReadAlongText/index.js";

export type { INativeRecorder, INativeRecorderOptions } from "./audio/nativeRecorder.js";
export { createNativeRecorder } from "./audio/nativeRecorder.js";
export type { IClipRecorderOptions } from "./audio/clipRecorder.js";
export { createClipRecorder } from "./audio/clipRecorder.js";
export type { INativeTtsDriver, INativeTtsDriverOptions } from "./audio/nativeTtsDriver.js";
export { createNativeTtsDriver } from "./audio/nativeTtsDriver.js";

export type { IDictationLabels, IReadAloudLabels } from "./labels.js";
export { DEFAULT_DICTATION_LABELS, DEFAULT_READ_ALOUD_LABELS } from "./labels.js";
export type { IMeasurable, IWindowRect } from "./measure.js";
export type { IVoiceTheme } from "./theme.js";
export { DARK_VOICE_THEME, LIGHT_VOICE_THEME, voiceTheme } from "./theme.js";
