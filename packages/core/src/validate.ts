import type { IConfig } from "./config.js";

export type ConfigErrorCode =
  | "NO_ADAPTER"
  | "UNKNOWN_KEY"
  | "STT_URL_INVALID"
  | "STT_TOKEN_INVALID"
  | "STT_MODEL_INVALID"
  | "STT_TIMEOUT_INVALID"
  | "TTS_URL_INVALID"
  | "TTS_TOKEN_INVALID"
  | "TTS_MODEL_INVALID"
  | "TTS_TIMEOUT_INVALID"
  | "LLM_URL_INVALID"
  | "LLM_TOKEN_INVALID"
  | "LLM_MODEL_INVALID"
  | "LLM_TIMEOUT_INVALID"
  | "LANGUAGES_NOT_AN_ARRAY"
  | "LANGUAGES_NOT_STRINGS"
  | "REFERENCE_INCOMPLETE"
  | "INVALID_CHUNKING"
  | "INVALID_UNHEARD_POLICY";

export interface IConfigError {
  code: ConfigErrorCode;
  message: string;
}

export type IValidationResult = { ok: true; config: IConfig } | { ok: false; errors: IConfigError[] };

const CONFIG_KEYS = ["tts", "stt", "llm", "languages", "reference", "chunking", "interrupt"] as const;

const STT_KEYS = ["url", "token", "model", "timeoutSeconds"] as const;

const TTS_KEYS = ["url", "token", "model", "timeoutSeconds"] as const;

const LLM_KEYS = ["url", "token", "model", "prompt", "timeoutSeconds", "disableThinking"] as const;

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);

    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function validateStt(stt: IConfig["stt"], errors: IConfigError[]): void {
  if (stt === undefined) {
    return;
  }

  const sttRecord = stt as unknown as Record<string, unknown>;

  for (const key of Object.keys(sttRecord)) {
    if (!STT_KEYS.includes(key as (typeof STT_KEYS)[number])) {
      errors.push({ code: "UNKNOWN_KEY", message: `unknown setting 'stt.${key}'` });
    }
  }

  if (typeof stt.url !== "string" || !isHttpUrl(stt.url)) {
    errors.push({ code: "STT_URL_INVALID", message: "stt.url must be an absolute http(s) address" });
  }

  if (stt.token !== undefined && (typeof stt.token !== "string" || stt.token.trim().length === 0)) {
    errors.push({ code: "STT_TOKEN_INVALID", message: "stt.token must be a non-empty string" });
  }

  if (stt.model !== undefined && (typeof stt.model !== "string" || stt.model.trim().length === 0)) {
    errors.push({ code: "STT_MODEL_INVALID", message: "stt.model must be a non-empty string" });
  }

  const timeout = stt.timeoutSeconds;

  if (timeout !== undefined && (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout <= 0)) {
    errors.push({ code: "STT_TIMEOUT_INVALID", message: "stt.timeoutSeconds must be a positive number" });
  }
}

function validateLlm(llm: IConfig["llm"], errors: IConfigError[]): void {
  if (llm === undefined) {
    return;
  }

  const llmRecord = llm as unknown as Record<string, unknown>;

  for (const key of Object.keys(llmRecord)) {
    if (!LLM_KEYS.includes(key as (typeof LLM_KEYS)[number])) {
      errors.push({ code: "UNKNOWN_KEY", message: `unknown setting 'llm.${key}'` });
    }
  }

  if (typeof llm.url !== "string" || !isHttpUrl(llm.url)) {
    errors.push({ code: "LLM_URL_INVALID", message: "llm.url must be an absolute http(s) address" });
  }

  if (llm.token !== undefined && (typeof llm.token !== "string" || llm.token.trim().length === 0)) {
    errors.push({ code: "LLM_TOKEN_INVALID", message: "llm.token must be a non-empty string" });
  }

  if (typeof llm.model !== "string" || llm.model.trim().length === 0) {
    errors.push({ code: "LLM_MODEL_INVALID", message: "llm.model must be a non-empty string" });
  }

  const timeout = llm.timeoutSeconds;

  if (timeout !== undefined && (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout <= 0)) {
    errors.push({ code: "LLM_TIMEOUT_INVALID", message: "llm.timeoutSeconds must be a positive number" });
  }
}

function validateTts(tts: IConfig["tts"], errors: IConfigError[]): void {
  if (tts === undefined) {
    return;
  }

  const ttsRecord = tts as unknown as Record<string, unknown>;

  for (const key of Object.keys(ttsRecord)) {
    if (!TTS_KEYS.includes(key as (typeof TTS_KEYS)[number])) {
      errors.push({ code: "UNKNOWN_KEY", message: `unknown setting 'tts.${key}'` });
    }
  }

  if (typeof tts.url !== "string" || !isHttpUrl(tts.url)) {
    errors.push({ code: "TTS_URL_INVALID", message: "tts.url must be an absolute http(s) address" });
  }

  if (tts.token !== undefined && (typeof tts.token !== "string" || tts.token.trim().length === 0)) {
    errors.push({ code: "TTS_TOKEN_INVALID", message: "tts.token must be a non-empty string" });
  }

  if (tts.model !== undefined && (typeof tts.model !== "string" || tts.model.trim().length === 0)) {
    errors.push({ code: "TTS_MODEL_INVALID", message: "tts.model must be a non-empty string" });
  }

  const ttsTimeout = tts.timeoutSeconds;

  if (ttsTimeout !== undefined && (typeof ttsTimeout !== "number" || !Number.isFinite(ttsTimeout) || ttsTimeout <= 0)) {
    errors.push({ code: "TTS_TIMEOUT_INVALID", message: "tts.timeoutSeconds must be a positive number" });
  }
}

export function validateConfig(config: IConfig): IValidationResult {
  const errors: IConfigError[] = [];

  const configRecord = config as unknown as Record<string, unknown>;

  for (const key of Object.keys(configRecord)) {
    if (!CONFIG_KEYS.includes(key as (typeof CONFIG_KEYS)[number])) {
      errors.push({ code: "UNKNOWN_KEY", message: `unknown setting '${key}'` });
    }
  }

  if (!config.tts && !config.stt) {
    errors.push({
      code: "NO_ADAPTER",
      message: "config needs at least one of tts or stt",
    });
  }

  validateStt(config.stt, errors);

  validateTts(config.tts, errors);

  validateLlm(config.llm, errors);

  let languages: string[] = [];

  if (!Array.isArray(config.languages)) {
    errors.push({ code: "LANGUAGES_NOT_AN_ARRAY", message: "languages must be an array" });
  } else if (config.languages.some((language) => typeof language !== "string")) {
    errors.push({ code: "LANGUAGES_NOT_STRINGS", message: "languages entries must be strings" });
  } else {
    languages = config.languages.map((language) => language.trim()).filter((language) => language.length > 0);
  }

  const reference = config.reference;

  if (reference) {
    const hasClipPath = typeof reference.clipPath === "string" && reference.clipPath.length > 0;
    const hasTranscript = typeof reference.transcript === "string" && reference.transcript.length > 0;

    if (!hasClipPath || !hasTranscript) {
      errors.push({
        code: "REFERENCE_INCOMPLETE",
        message: "reference needs both clipPath and transcript",
      });
    }
  }

  if (config.chunking !== undefined && config.chunking !== "semantic" && config.chunking !== "growth") {
    errors.push({ code: "INVALID_CHUNKING", message: 'chunking must be "semantic" or "growth"' });
  }

  const unheard = config.interrupt?.unheard;

  if (unheard !== undefined && unheard !== "keep" && unheard !== "hide") {
    errors.push({
      code: "INVALID_UNHEARD_POLICY",
      message: 'interrupt.unheard must be "keep" or "hide"',
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, config: { ...config, languages } };
}
