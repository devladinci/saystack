import type { ISpeechClipResult, ITtsDriver, RequestHeaders, SpeechFetch } from "@saystack/core";
import { createHttpSynthesize } from "@saystack/core";

import { sharedAudioContext, unlockWebAudio } from "./audioContext.js";
import { createWebClip } from "./webClip.js";

export interface IWebTtsDriverOptions {
  endpoint: string;
  headers?: RequestHeaders;
  context?: AudioContext;
  output?: AudioNode | (() => AudioNode | null);
  fetch?: SpeechFetch;
}

export function createWebTtsDriver({ endpoint, headers = {}, context, output, fetch }: IWebTtsDriverOptions): ITtsDriver {
  const audioContext = (): AudioContext => context ?? sharedAudioContext();

  return {
    unlock: () => {
      unlockWebAudio(context);
    },

    synthesize: createHttpSynthesize({ endpoint, headers, ...(fetch === undefined ? {} : { fetch }) }),

    createClip: async (audio): Promise<ISpeechClipResult> => {
      const destination = typeof output === "function" ? output() : (output ?? null);

      try {
        const clip = await createWebClip(audio, {
          context: audioContext(),
          ...(destination === null ? {} : { output: destination }),
        });

        return { ok: true, clip };
      } catch (error: unknown) {
        return {
          ok: false,
          errorCode: "TTS_UNSUPPORTED_MEDIA",
          message: error instanceof Error ? error.message : "the audio could not be decoded",
        };
      }
    },
  };
}
