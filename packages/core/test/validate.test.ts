import { describe, expect, it } from "vitest";

import type { ChunkingMode, IConfig, IInterruptConfig } from "../src/config.js";
import { validateConfig, type IConfigError } from "../src/validate.js";

const validTtsConfig: IConfig = {
  tts: { url: "http://127.0.0.1:7777", token: "secret", model: "m" },
  languages: [],
};

const validSttConfig: IConfig = {
  stt: { url: "http://127.0.0.1:7777", token: "secret", model: "m" },
  languages: [],
};

function expectErrors(config: IConfig): IConfigError[] {
  const result = validateConfig(config);

  if (result.ok) throw new Error("expected validation failure");

  return result.errors;
}

describe("config shape", () => {
  it("carves stt its own settings block: url, token, model, timeout", () => {
    const config: IConfig = {
      stt: { url: "http://127.0.0.1:7777", token: "t", model: "whisper-large-v3-turbo", timeoutSeconds: 120 },
      languages: [],
    };

    expect(config.stt?.model).toBe("whisper-large-v3-turbo");
    expect(config.stt?.timeoutSeconds).toBe(120);
  });

  it("keeps functions out of the serializable settings shape", () => {
    expect("normalize" in validTtsConfig).toBe(false);
    expect("sttAdapter" in validSttConfig).toBe(false);
  });
});

describe("validateConfig — valid configs", () => {
  it("accepts a config with only stt", () => {
    const result = validateConfig(validSttConfig);

    if (!result.ok) throw new Error("expected valid");
    expect(result.config.languages).toEqual([]);
    expect(result.config.stt?.url).toBe(validSttConfig.stt?.url);
  });

  it("accepts tts-only settings without normalize — runtime code joins later, not in settings", () => {
    const result = validateConfig(validTtsConfig);

    expect(result.ok).toBe(true);
  });

  it("accepts a full config with every section filled", () => {
    const result = validateConfig({
      tts: { url: "http://tts", model: "m" },
      stt: { url: "http://stt", token: "t", model: "m", timeoutSeconds: 30 },
      languages: ["bg"],
      reference: { clipPath: "/tmp/clip.wav", transcript: "aha" },
      chunking: "growth",
      interrupt: { unheard: "keep" },
    });

    expect(result.ok).toBe(true);
  });

  it("accepts languages: [] — no language enforced", () => {
    expect(validateConfig(validSttConfig).ok).toBe(true);
  });

  it("returns the corrected config only on success", () => {
    const result = validateConfig({ ...validSttConfig, languages: [" bg ", ""] });

    if (!result.ok) throw new Error("expected valid");
    expect(result.config.languages).toEqual(["bg"]);
  });
});

describe("validateConfig — result shape is strict", () => {
  it("failure carries no config at all", () => {
    const result = validateConfig({} as unknown as IConfig);

    expect(result.ok).toBe(false);
    expect("config" in result).toBe(false);
  });

  it("success cannot carry error entries by type", () => {
    const result = validateConfig(validSttConfig);

    if (!result.ok) throw new Error("expected valid");
    expect("errors" in result).toBe(false);
  });
});

describe("validateConfig — serializable settings checks", () => {
  it("rejects unknown top-level keys (UNKNOWN_KEY)", () => {
    const errors = expectErrors({ ...validSttConfig, normalize: "oops" } as unknown as IConfig);

    expect(errors).toContainEqual(
      expect.objectContaining({ code: "UNKNOWN_KEY", message: expect.stringContaining("'normalize'") }),
    );
  });

  it("accepts llm.disableThinking", () => {
    const result = validateConfig({
      ...validSttConfig,
      llm: { url: "http://127.0.0.1:7777", model: "gemma-4", disableThinking: true },
    });

    expect(result.ok).toBe(true);
  });

  it("rejects unknown llm keys (UNKNOWN_KEY)", () => {
    const errors = expectErrors({
      ...validSttConfig,
      llm: { url: "http://127.0.0.1:7777", model: "gemma-4", think: true } as unknown as NonNullable<IConfig["llm"]>,
    });

    expect(errors[0]?.code).toBe("UNKNOWN_KEY");
    expect(errors[0]?.message).toContain("llm.think");
  });

  it("rejects unknown stt keys (UNKNOWN_KEY)", () => {
    const errors = expectErrors({
      ...validSttConfig,
      stt: { url: "http://s", uurl: "x" } as unknown as NonNullable<IConfig["stt"]>,
    });

    expect(errors[0]?.code).toBe("UNKNOWN_KEY");
    expect(errors[0]?.message).toContain("stt.uurl");
  });

  it("rejects a relative stt.url (STT_URL_INVALID)", () => {
    const errors = expectErrors({ ...validSttConfig, stt: { url: "/api/voice", model: "m" } });

    expect(errors[0]?.code).toBe("STT_URL_INVALID");
  });

  it("rejects an empty stt.url (STT_URL_INVALID)", () => {
    const errors = expectErrors({ ...validSttConfig, stt: { url: "", model: "m" } });

    expect(errors[0]?.code).toBe("STT_URL_INVALID");
  });

  it("rejects an empty stt.token (STT_TOKEN_INVALID)", () => {
    const errors = expectErrors({ ...validSttConfig, stt: { url: "http://s", token: "", model: "m" } });

    expect(errors[0]?.code).toBe("STT_TOKEN_INVALID");
  });

  it("rejects a blank stt.model (STT_MODEL_INVALID)", () => {
    const errors = expectErrors({ ...validSttConfig, stt: { url: "http://s", model: " " } });

    expect(errors[0]?.code).toBe("STT_MODEL_INVALID");
  });

  it("rejects a missing stt.model (STT_MODEL_INVALID) — no server's model is a safe default", () => {
    const errors = expectErrors({ ...validSttConfig, stt: { url: "http://s" } as never });

    expect(errors[0]?.code).toBe("STT_MODEL_INVALID");
  });

  it("rejects a missing tts.model (TTS_MODEL_INVALID)", () => {
    const errors = expectErrors({ ...validTtsConfig, tts: { url: "http://t" } as never });

    expect(errors[0]?.code).toBe("TTS_MODEL_INVALID");
  });

  it("rejects a non-positive stt.timeoutSeconds (STT_TIMEOUT_INVALID)", () => {
    const errors = expectErrors({ ...validSttConfig, stt: { url: "http://s", model: "m", timeoutSeconds: 0 } });

    expect(errors[0]?.code).toBe("STT_TIMEOUT_INVALID");
  });

  it("rejects a bad tts.url (TTS_URL_INVALID)", () => {
    const errors = expectErrors({ ...validSttConfig, tts: { url: "ftp://tts", model: "m" } });

    expect(errors).toContainEqual(expect.objectContaining({ code: "TTS_URL_INVALID" }));
  });
});

describe("validateConfig — structural checks", () => {
  it("rejects a config with neither tts nor stt (NO_ADAPTER)", () => {
    const errors = expectErrors({ languages: [] });

    expect(errors[0]?.code).toBe("NO_ADAPTER");
  });

  it("rejects languages as a bare string (LANGUAGES_NOT_AN_ARRAY)", () => {
    const errors = expectErrors({ ...validSttConfig, languages: "bg" as unknown as string[] });

    expect(errors[0]?.code).toBe("LANGUAGES_NOT_AN_ARRAY");
  });

  it("rejects non-string entries in languages (LANGUAGES_NOT_STRINGS)", () => {
    const errors = expectErrors({ ...validSttConfig, languages: ["bg", 123] as unknown as string[] });

    expect(errors[0]?.code).toBe("LANGUAGES_NOT_STRINGS");
  });

  it("rejects reference with only clipPath (REFERENCE_INCOMPLETE)", () => {
    const errors = expectErrors({
      ...validSttConfig,
      reference: { clipPath: "/tmp/clip.wav", transcript: "" },
    });

    expect(errors[0]?.code).toBe("REFERENCE_INCOMPLETE");
  });

  it("rejects an unknown chunking mode (INVALID_CHUNKING)", () => {
    const errors = expectErrors({ ...validSttConfig, chunking: "smart" as unknown as ChunkingMode });

    expect(errors[0]?.code).toBe("INVALID_CHUNKING");
  });

  it("rejects an unknown unheard policy (INVALID_UNHEARD_POLICY)", () => {
    const errors = expectErrors({
      ...validSttConfig,
      interrupt: { unheard: "mute" } as unknown as IInterruptConfig,
    });

    expect(errors[0]?.code).toBe("INVALID_UNHEARD_POLICY");
  });
});

describe("validateConfig — multi-error collection", () => {
  it("collects every problem in one pass", () => {
    const errors = expectErrors({
      stt: { url: "", model: "m" },
      languages: [""],
      chunking: "x" as unknown as ChunkingMode,
    });

    const codes = errors.map((error) => error.code);

    expect(codes).toContain("STT_URL_INVALID");
    expect(codes).toContain("INVALID_CHUNKING");
  });
});
