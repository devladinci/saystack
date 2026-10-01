import type { IDictationInput, ISttTranscribeResult } from "@saystack/core";
import type { IWebDictation } from "@saystack/react-web";
import { useWebDictation } from "@saystack/react-web";
import { useEffect, useRef, useState } from "react";

import { DICTATION_CLIP } from "./clips.js";
import { browserRecognition } from "./dictation/browserRecognition.js";
import { createClipRecorder } from "./dictation/clipRecorder.js";
import { clipTranscription } from "./dictation/clipTranscription.js";
import type { DictationSource } from "./settings.js";

const NO_RECOGNITION: ISttTranscribeResult = {
  ok: false,
  errorCode: "ENGINE_UNAVAILABLE",
  message: "This browser has no speech recognition, so only the aura follows your voice. Try the demo clip.",
};

const NOTHING_HEARD: ISttTranscribeResult = { ok: true, text: "" };

// The microphone with the browser's own recognition, or a recorded voice that streams its words as it plays.
export function usePlaygroundDictation(source: DictationSource, bands: number, input: IDictationInput): IWebDictation {
  const stopRef = useRef<() => void>(() => undefined);
  const [clipRecorder] = useState(() => createClipRecorder(DICTATION_CLIP, () => stopRef.current()));
  const [clipLive] = useState(() => clipTranscription(DICTATION_CLIP, () => clipRecorder.elapsed()));
  const [microphoneLive] = useState(() => browserRecognition());
  const isDemo = source === "demo";

  const dictation = useWebDictation({
    bands,
    input,
    live: isDemo ? clipLive : microphoneLive,
    transcribe: async () => (isDemo ? NOTHING_HEARD : NO_RECOGNITION),
    ...(isDemo ? { recorder: clipRecorder } : {}),
  });

  useEffect(() => {
    stopRef.current = dictation.handlePressEnd;
  });

  return dictation;
}
