export const VERSION = "0.0.1";

export type {
  ChunkingMode,
  ILlmEngineConfig,
  IConfig,
  IInterruptConfig,
  IReferenceConfig,
  ISttEngineConfig,
  ITtsEngineConfig,
  UnheardPolicy,
} from "./config.js";

export type { IDictationInput, ILiveTranscription, LiveTranscriptionFactory } from "./dictation.js";

export type { ILiveTranscriptionOptions, IPcmSource } from "./liveTranscription.js";
export { startLiveTranscription } from "./liveTranscription.js";

export type { IDecodedWav, IPcm16Chunker, IPcm16ChunkerOptions } from "./audio/pcm.js";
export { createPcm16Chunker, createResampler, decodeWav, pcm16ToFloat, pcm16ToWav } from "./audio/pcm.js";

export type { RequestHeaders } from "./http.js";
export { resolveHeaders } from "./http.js";

export type { INormalizeFn, INormalizeResult, NormalizeErrorCode } from "./normalize.js";

export type {
  INativeRecording,
  IPlatformRecorder,
  IVoiceRecording,
  IVoiceRecorderResult,
  IWebRecording,
} from "./platform.js";
export { getVoiceRecorder, setVoiceRecorder } from "./platform.js";

export type {
  ISttAdapter,
  ISttCapabilities,
  ISttRealtimeAdapter,
  ISttRealtimeInput,
  ISttRealtimeResult,
  ISttRealtimeSession,
  ISttTranscribeInput,
  ISttTranscribeResult,
  SttErrorCode,
} from "./stt.js";
export { isSttErrorCode, REALTIME_PCM_RATE } from "./stt.js";

export type { ConfigErrorCode, IConfigError, IValidationResult } from "./validate.js";
export { validateConfig } from "./validate.js";

export type {
  ISpeechChunk,
  ISpeechClip,
  ISpeechClipResult,
  ISpeechPosition,
  ISpeechState,
  ITtsAdapter,
  ITtsCapabilities,
  ITtsDriver,
  ITtsSynthesizeInput,
  ITtsSynthesizeResult,
  TtsErrorCode,
  TtsPhase,
} from "./tts/types.js";

export type {
  IRewriteFn,
  IRewriteResult,
  ISpeechOutcome,
  ISpeechOptions,
  ISpeechSession,
  ISpeechSessionOptions,
} from "./tts/session.js";
export { createSpeechSession } from "./tts/session.js";

export { hasSpeechText, needsRewrite, needsSummary, speechChunks, toReadingBlocks, toSpeechText } from "./tts/text.js";

export type { IStyleChannel, IStyleMap, IStyleRule, IStyledText } from "./tts/style.js";
export {
  applyStyle,
  EMPTY_STYLE_MAP,
  matchStyle,
  NO_STYLE_CHANNEL,
  STYLE_SLOT,
  styleChoices,
  styleReserve,
} from "./tts/style.js";

export type { IHttpSpeechOptions, SpeechFetch } from "./tts/httpSpeech.js";
export { createHttpSynthesize } from "./tts/httpSpeech.js";

export type { ISpeechEnvelope, ISpeechMark, ISpeechPause, IWordTiming, IWordToken } from "./tts/timing.js";
export { estimateWordTimings, speechEnvelope, tokenizeWords, wordAt, wordTimingsFromMarks } from "./tts/timing.js";

export { alignWords, wordKey } from "./tts/align.js";

export type {
  AuraBackground,
  AuraLayout,
  AuraNumericKey,
  AuraOutline,
  AuraPaletteName,
  AuraPlacement,
  IAuraRange,
  IAuraStyle,
  IAuraStyleOptions,
} from "./aura/style.js";
export {
  AURA_LAYOUTS,
  AURA_OUTLINES,
  AURA_PALETTES,
  AURA_PLACEMENTS,
  AURA_RANGES,
  auraStyleFor,
  DEFAULT_AURA_STYLE,
  MESSAGE_AURA_STYLE,
  resolveAuraStyle,
} from "./aura/style.js";

export type {
  AuraClip,
  AuraEffects,
  AuraState,
  IAuraFit,
  IAuraHost,
  IAuraRect,
  IAuraRenderer,
  IAuraRendererOptions,
  IAuraSettings,
  IAuraView,
} from "./aura/renderer.js";
export { createAuraRenderer } from "./aura/renderer.js";
export { MAX_BANDS as MAX_AURA_BANDS } from "./aura/shaders.js";

export type {
  IPcmLevels,
  IPcmLevelsOptions,
  IPcmMeter,
  IPcmMeterOptions,
  ISampleWindow,
  ISpectrumAnalyser,
  ISpectrumAnalyserOptions,
  PcmWindowReader,
} from "./aura/spectrum.js";
export {
  createPcmLevels,
  createPcmMeter,
  createSampleWindow,
  createSpectrumAnalyser,
  fftSizeFor,
} from "./aura/spectrum.js";

export type { IBandPalette, LinearRgb } from "./aura/palette.js";
export { bandPalette } from "./aura/palette.js";

export type { IBandMeter, IBandMeterOptions } from "./aura/bandMeter.js";
export { bandEdges, createBandMeter } from "./aura/bandMeter.js";
