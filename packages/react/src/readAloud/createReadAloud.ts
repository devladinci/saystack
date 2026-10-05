import type { IRewriteFn, IRewriteResult, IStyleMap, ITtsDriver } from "@saystack/core";
import { createSpeechSession, hasSpeechText, needsRewrite, needsSummary } from "@saystack/core";

import { createSpeechApi } from "../useSpeech.js";
import type { IReadAloudStore, ReadAloudId } from "./readAloudStore.js";
import { createReadAloudStore } from "./readAloudStore.js";

export type RewriteFn = IRewriteFn;

// A summary may carry a style too, the same way a rewrite does.
export type SummarizeFn = (
  id: ReadAloudId,
  markdown: string,
  signal: AbortSignal,
) => Promise<string | IRewriteResult | null>;

export interface IReadAloudSources {
  rewrite?: RewriteFn;
  shouldRewrite?: (markdown: string) => boolean;
  summarize?: SummarizeFn;
  shouldSummarize?: (markdown: string) => boolean;
  styleMap?: IStyleMap;
}

export interface ICreateReadAloudOptions {
  driver: ITtsDriver;
  readLevels: () => ArrayLike<number> | undefined;
  sources: () => IReadAloudSources;
}

// Sources are read when speech starts, so a provider may hand in fresh functions on every render.
export function createReadAloud<TAnchor>({
  driver,
  readLevels,
  sources,
}: ICreateReadAloudOptions): IReadAloudStore<TAnchor> {
  const spoken: RewriteFn = async (markdown, signal) => {
    const { rewrite, shouldRewrite = needsRewrite, summarize, shouldSummarize = needsSummary } = sources();
    const id = store.speakingId();

    if (summarize !== undefined && id !== null && shouldSummarize(markdown)) {
      const summary = await summarize(id, markdown, signal);
      const isSummary = summary !== null && hasSpeechText(typeof summary === "string" ? summary : summary.text);
      store.markSummary(id, isSummary);

      if (isSummary) {
        return summary;
      }
    }

    return rewrite !== undefined && shouldRewrite(markdown) ? rewrite(markdown, signal) : null;
  };

  const session = createSpeechSession(driver, {
    get rewrite() {
      const current = sources();

      return current.rewrite === undefined && current.summarize === undefined ? undefined : spoken;
    },
    // spoken applies the summary's and the rewrite's own triggers, so the session must not gate it on either.
    shouldRewrite: () => true,
    get styleMap() {
      return sources().styleMap;
    },
  });
  const store = createReadAloudStore<TAnchor>(session, createSpeechApi(session, driver), readLevels);

  return store;
}
