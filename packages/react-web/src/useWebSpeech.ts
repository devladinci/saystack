import type { ISpeechSessionOptions, ITtsDriver } from "@saystack/core";
import type { ISpeechHookResult } from "@saystack/react";
import { useSpeech } from "@saystack/react";
import type { IAudioLevels } from "@saystack/web";
import { createWebTtsDriver } from "@saystack/web";
import { useEffect, useRef, useState } from "react";

import { useAudioLevels } from "./useAudioLevels.js";

export interface IUseWebSpeechOptions extends ISpeechSessionOptions {
  endpoint: string;
  headers?: Readonly<Record<string, string>>;
  bands?: number;
}

export interface IWebSpeech {
  speech: ISpeechHookResult;
  levels: IAudioLevels | null;
}

export function useWebSpeech({ endpoint, headers, bands, ...sessionOptions }: IUseWebSpeechOptions): IWebSpeech {
  const levels = useAudioLevels({ isAudible: true, ...(bands === undefined ? {} : { bands }) });
  const levelsRef = useRef<IAudioLevels | null>(null);

  useEffect(() => {
    levelsRef.current = levels;
  }, [levels]);

  const [driver] = useState(
    (): ITtsDriver =>
      createWebTtsDriver({
        endpoint,
        ...(headers === undefined ? {} : { headers }),
        output: () => levelsRef.current?.input ?? null,
      }),
  );
  const speech = useSpeech(driver, sessionOptions);

  return { speech, levels };
}
