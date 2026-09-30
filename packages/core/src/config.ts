import type { INormalizeFn } from "./normalize.js";

export type ChunkingMode = "semantic" | "growth";

export type UnheardPolicy = "keep" | "hide";

export interface ITtsEngineConfig {
  url: string;
  token?: string;
  model?: string;
  timeoutSeconds?: number;
}

export interface ISttEngineConfig {
  url: string;
  token?: string;
  model?: string;
  timeoutSeconds?: number;
}

export interface ILlmEngineConfig {
  url: string;
  token?: string;
  model: string;
  prompt?: string;
  timeoutSeconds?: number;
  disableThinking?: boolean;
}

export interface IReferenceConfig {
  clipPath: string;
  transcript: string;
}

export interface IInterruptConfig {
  unheard?: UnheardPolicy;
}

export interface IConfig {
  tts?: ITtsEngineConfig;
  stt?: ISttEngineConfig;
  llm?: ILlmEngineConfig;
  languages: string[];
  reference?: IReferenceConfig;
  chunking?: ChunkingMode;
  interrupt?: IInterruptConfig;
}

export interface IVoiceRuntime {
  normalize?: INormalizeFn;
}