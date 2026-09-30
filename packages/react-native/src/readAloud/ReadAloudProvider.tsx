import type { ITtsDriver, RequestHeaders } from "@saystack/core";
import { resolveHeaders } from "@saystack/core";
import type { IReadAloudSources, IReadAloudStore, RewriteFn, SummarizeFn } from "@saystack/react";
import { createReadAloud } from "@saystack/react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import type { INativeTtsDriver } from "../audio/nativeTtsDriver.js";
import { createNativeTtsDriver } from "../audio/nativeTtsDriver.js";
import type { IMeasurable } from "../measure.js";
import { ReadAloudContext } from "./readAloudContext.js";

interface IProps {
  endpoint?: string;
  headers?: RequestHeaders;
  driver?: ITtsDriver & Partial<Pick<INativeTtsDriver, "readLevels" | "setBands">>;
  bands?: number;
  rewrite?: RewriteFn;
  shouldRewrite?: (markdown: string) => boolean;
  summarize?: SummarizeFn;
  children: ReactNode;
}

interface ILatest extends IReadAloudSources {
  headers?: RequestHeaders;
}

type Driver = ITtsDriver & Partial<Pick<INativeTtsDriver, "readLevels" | "setBands">>;

const driverFor = (endpoint: string | undefined, driver: Driver | undefined, headers: () => Readonly<Record<string, string>>): Driver => {
  if (driver !== undefined) {
    return driver;
  }

  if (endpoint === undefined) {
    throw new Error("saystack: <ReadAloudProvider> needs an endpoint or a driver");
  }

  return createNativeTtsDriver({ endpoint, headers });
};

export function ReadAloudProvider({ endpoint, headers, driver, bands, rewrite, shouldRewrite, summarize, children }: IProps) {
  const latestRef = useRef<ILatest>({});

  useEffect(() => {
    latestRef.current = {
      ...(headers === undefined ? {} : { headers }),
      ...(rewrite === undefined ? {} : { rewrite }),
      ...(shouldRewrite === undefined ? {} : { shouldRewrite }),
      ...(summarize === undefined ? {} : { summarize }),
    };
  });

  const [ttsDriver] = useState(() => driverFor(endpoint, driver, () => resolveHeaders(latestRef.current.headers)));

  const [store] = useState(
    (): IReadAloudStore<IMeasurable> =>
      createReadAloud<IMeasurable>({
        driver: ttsDriver,
        readLevels: () => ttsDriver.readLevels?.(),
        sources: () => latestRef.current,
      }),
  );

  useEffect(() => {
    if (bands !== undefined) {
      ttsDriver.setBands?.(bands);
    }
  }, [ttsDriver, bands]);

  useEffect(() => store.connect(), [store]);

  return <ReadAloudContext.Provider value={store}>{children}</ReadAloudContext.Provider>;
}
