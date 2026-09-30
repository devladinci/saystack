import type { ITtsDriver } from "@saystack/core";
import { createSpeechSession, hasSpeechText } from "@saystack/core";

import { createSpeechApi } from "../useSpeech.js";
import type { IReadAloudStore, ReadAloudId } from "./readAloudStore.js";
import { createReadAloudStore } from "./readAloudStore.js";

export type RewriteFn = (markdown: string, signal: AbortSignal) => Promise<string | null>;

export type SummarizeFn = (id: ReadAloudId, markdown: string, signal: AbortSignal) => Promise<string | null>;

export interface IReadAloudSources {
  rewrite?: RewriteFn;
  shouldRewrite?: (markdown: string) => boolean;
  summarize?: SummarizeFn;
}

export interface ICreateReadAloudOptions {
  driver: ITtsDriver;
  readLevels: () => ArrayLike<number> | undefined;
  sources: () => IReadAloudSources;
}

// Sources are read when speech starts, so a provider may hand in fresh functions on every render.
export function createReadAloud<TAnchor>({ driver, readLevels, sources }: ICreateReadAloudOptions): IReadAloudStore<TAnchor> {
  const spoken: RewriteFn = async (markdown, signal) => {
    const current = sources();
    const id = store.speakingId();

    if (current.summarize !== undefined && id !== null) {
      const summary = await current.summarize(id, markdown, signal);
      const isSummary = summary !== null && hasSpeechText(summary);
      store.markSummary(id, isSummary);

      if (isSummary) {
        return summary;
      }
    }

    return current.rewrite === undefined ? null : current.rewrite(markdown, signal);
  };

  const session = createSpeechSession(driver, {
    get rewrite() {
      const current = sources();

      return current.rewrite === undefined && current.summarize === undefined ? undefined : spoken;
    },
    get shouldRewrite() {
      return sources().shouldRewrite;
    },
  });
  const store = createReadAloudStore<TAnchor>(session, createSpeechApi(session, driver), readLevels);

  return store;
}
