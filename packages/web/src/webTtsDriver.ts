import type { ISpeechClipResult, ITtsDriver, RequestHeaders, SpeechFetch } from "@saystack/core";
import { createHttpSynthesize } from "@saystack/core";

import { sharedAudioContext, unlockWebAudio } from "./audioContext.js";
import { createWebClip } from "./webClip.js";

export interface IWebTtsDriverOptions {
  endpoint?: string;
  // Where the audio comes from when it is not an HTTP endpoint; it still plays through output.
  synthesize?: ITtsDriver["synthesize"];
  headers?: RequestHeaders;
  context?: AudioContext;
  output?: AudioNode | (() => AudioNode | null);
  fetch?: SpeechFetch;
}

const synthesizeFrom = ({
  endpoint,
  synthesize,
  headers = {},
  fetch,
}: IWebTtsDriverOptions): ITtsDriver["synthesize"] => {
  if (synthesize !== undefined) {
    return synthesize;
  }

  if (endpoint === undefined) {
    throw new Error("saystack: createWebTtsDriver needs an endpoint or synthesize");
  }

  return createHttpSynthesize({ endpoint, headers, ...(fetch === undefined ? {} : { fetch }) });
};

export function createWebTtsDriver(options: IWebTtsDriverOptions): ITtsDriver {
  const { context, output } = options;
  const audioContext = (): AudioContext => context ?? sharedAudioContext();

  return {
    unlock: () => {
      unlockWebAudio(context);
    },

    synthesize: synthesizeFrom(options),

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
