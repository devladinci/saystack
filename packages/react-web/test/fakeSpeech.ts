import type { ISpeechChunk, ISpeechPosition, ISpeechState } from "@saystack/core";
import type { ISpeechApi, ISpeechHookResult } from "@saystack/react";
import { vi } from "vitest";

export interface IFakeSpeech {
  result: ISpeechHookResult;
  api: { [key in keyof ISpeechApi]: ReturnType<typeof vi.fn> };
}

export const chunk = (text: string, duration = 2): ISpeechChunk => ({ text, words: [], duration });

export function fakeSpeech(
  state: Partial<ISpeechState>,
  position: ISpeechPosition = { chunkIndex: 0, time: 0.5, duration: 2, wordIndex: 1 },
): IFakeSpeech {
  const api = {
    speak: vi.fn(async () => undefined),
    stop: vi.fn(),
    replay: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    seek: vi.fn(),
    position: vi.fn(() => position),
  };
  const fullState: ISpeechState = {
    phase: "idle",
    text: "",
    errorCode: null,
    errorMessage: null,
    chunks: [],
    chunkIndex: -1,
    ...state,
  };

  return { result: [fullState, api as unknown as ISpeechApi], api };
}
