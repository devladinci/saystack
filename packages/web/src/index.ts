export { sharedAudioContext, unlockWebAudio } from "./audioContext.js";

export type { IAudioLevels, IAudioLevelsOptions } from "./audioLevels.js";
export { createAudioLevels } from "./audioLevels.js";

export type { IWebClipOptions } from "./webClip.js";
export { createWebClip } from "./webClip.js";

export type { IWebRecorderOptions } from "./webRecorder.js";
export { createWebRecorder } from "./webRecorder.js";

export type { IPcmCapture, IPcmCaptureOptions } from "./pcmCapture.js";
export { capturePcm } from "./pcmCapture.js";

export type { IRealtimeTranscriptionOptions } from "./realtimeTranscription.js";
export { startRealtimeTranscription } from "./realtimeTranscription.js";

export type { IWebTtsDriverOptions } from "./webTtsDriver.js";
export { createWebTtsDriver } from "./webTtsDriver.js";

export type { AuraMode, AuraState, IAura, IAuraAnchorOptions, IAuraOptions } from "./aura/createAura.js";
export { createAura } from "./aura/createAura.js";

export type { IReadAlong, IReadAlongOptions, IReadAlongSeek } from "./readAlong/createReadAlong.js";
export { createReadAlong, READ_HIGHLIGHT, UNREAD_HIGHLIGHT } from "./readAlong/createReadAlong.js";
export { DEFAULT_BLOCKS } from "./readAlong/scanPage.js";

export type { IStreamingInput } from "./streamingInput.js";
export { createStreamingInput } from "./streamingInput.js";

export type { IFieldInputOptions } from "./fieldInput.js";
export { createFieldInput } from "./fieldInput.js";

export type { ISpectrumLine, ISpectrumLineOptions, SpectrumLineState } from "./spectrumLine.js";
export { createSpectrumLine } from "./spectrumLine.js";
