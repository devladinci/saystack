import { vi } from "vitest";

import type { ISpeechClipResult, ITtsDriver, ITtsSynthesizeInput, ITtsSynthesizeResult } from "@saystack/core";

const WAV = new ArrayBuffer(8);

export type ISynthFn = (input: ITtsSynthesizeInput) => Promise<ITtsSynthesizeResult>;

export type IClipFn = (audio: ArrayBuffer) => Promise<ISpeechClipResult>;

const instantClip = async (): Promise<ISpeechClipResult> => ({
  ok: true,
  clip: { play: async () => undefined, stop: () => undefined, release: () => undefined },
});

export interface IDriverFakes {
  synthesize?: ISynthFn;
  createClip?: IClipFn;
}

export function makeDriver(fakes?: IDriverFakes): ITtsDriver {
  const synthesize =
    fakes?.synthesize ??
    vi.fn(async (): Promise<ITtsSynthesizeResult> => ({ ok: true, audio: WAV, mimeType: "audio/wav" }));

  const createClip = fakes?.createClip ?? vi.fn(instantClip);

  return { synthesize, createClip };
}
