import type { ITtsDriver, RequestHeaders } from "@saystack/core";
import { resolveHeaders } from "@saystack/core";
import type { IReadAloudSources, IReadAloudStore, RewriteFn, SummarizeFn } from "@saystack/react";
import { createReadAloud } from "@saystack/react";
import type { IAudioLevels } from "@saystack/web";
import { createWebTtsDriver } from "@saystack/web";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { ReadAloudContext } from "./readAloudContext.js";
import { useAudioLevels } from "./useAudioLevels.js";

interface ISpeechSource {
  endpoint?: string;
  headers?: RequestHeaders;
  driver?: ITtsDriver;
}

interface IProps extends ISpeechSource {
  bands?: number;
  rewrite?: RewriteFn;
  shouldRewrite?: (markdown: string) => boolean;
  summarize?: SummarizeFn;
  children: ReactNode;
}

interface ILatest extends IReadAloudSources {
  headers?: RequestHeaders;
}

const driverFor = (
  { endpoint, driver }: ISpeechSource,
  headers: () => Readonly<Record<string, string>>,
  output: () => AudioNode | null,
): ITtsDriver => {
  if (driver !== undefined) {
    return driver;
  }

  if (endpoint === undefined) {
    throw new Error("saystack: <ReadAloudProvider> needs an endpoint or a driver");
  }

  return createWebTtsDriver({ endpoint, headers, output });
};

export function ReadAloudProvider({
  endpoint,
  headers,
  driver,
  bands,
  rewrite,
  shouldRewrite,
  summarize,
  children,
}: IProps) {
  const levels = useAudioLevels(bands === undefined ? { isAudible: true } : { isAudible: true, bands });
  const levelsRef = useRef<IAudioLevels | null>(null);
  const latestRef = useRef<ILatest>({});

  useEffect(() => {
    levelsRef.current = levels;
  }, [levels]);

  useEffect(() => {
    latestRef.current = {
      ...(headers === undefined ? {} : { headers }),
      ...(rewrite === undefined ? {} : { rewrite }),
      ...(shouldRewrite === undefined ? {} : { shouldRewrite }),
      ...(summarize === undefined ? {} : { summarize }),
    };
  });

  const [store] = useState((): IReadAloudStore<Element> =>
    createReadAloud<Element>({
      driver: driverFor(
        { ...(endpoint === undefined ? {} : { endpoint }), ...(driver === undefined ? {} : { driver }) },
        () => resolveHeaders(latestRef.current.headers),
        () => levelsRef.current?.input ?? null,
      ),
      readLevels: () => levelsRef.current?.read(),
      sources: () => latestRef.current,
    }),
  );

  useEffect(() => store.connect(), [store]);

  return <ReadAloudContext.Provider value={store}>{children}</ReadAloudContext.Provider>;
}
