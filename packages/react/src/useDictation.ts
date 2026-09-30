import type {
  ILiveTranscription,
  IPlatformRecorder,
  ISttTranscribeResult,
  IVoiceRecorderResult,
  SttErrorCode,
} from "@saystack/core";
import { getVoiceRecorder } from "@saystack/core";
import { useEffect, useRef, useState } from "react";

import { dictationEndpoint, sendDictation } from "./dictationSender.js";
import type { DictationState, IUseDictationOptions, IUseDictationResult, TranscribeFn } from "./types.js";

interface ISession {
  readonly recorder: IPlatformRecorder;
  live: ILiveTranscription | null;
  heard: string;
  isCancelled: boolean;
}

const recorderFor = (recorder?: IPlatformRecorder): IVoiceRecorderResult =>
  recorder === undefined ? getVoiceRecorder() : { ok: true, recorder };

const transcribeWith = ({ transcribe, endpoint, headers, prompt }: IUseDictationOptions): TranscribeFn => {
  if (transcribe !== undefined) {
    return transcribe;
  }

  return (recording, signal) =>
    sendDictation(endpoint ?? dictationEndpoint(window.location.origin), recording, {
      signal,
      ...(prompt === undefined ? {} : { prompt }),
      ...(headers === undefined ? {} : { headers }),
    });
};

export function useDictation(options: IUseDictationOptions = {}): IUseDictationResult {
  const optionsRef = useRef(options);
  const sessionRef = useRef<ISession | null>(null);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<DictationState>("idle");
  const [text, setText] = useState("");
  const [errorCode, setErrorCode] = useState<SttErrorCode | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(
    () => () => {
      const session = sessionRef.current;
      sessionRef.current = null;
      abortRef.current?.abort();

      if (session !== null) {
        session.isCancelled = true;
        session.live?.cancel();
        void session.recorder.stopRecording().catch(() => undefined);
      }
    },
    [],
  );

  const fail = (code: SttErrorCode, message?: string): void => {
    setErrorCode(code);
    setErrorMessage(message);
    setState("error");
  };

  const deliver = (result: ISttTranscribeResult, session: ISession): void => {
    const { input, onText } = optionsRef.current;
    const wasLive = session.live?.isLive === true;

    if (!result.ok) {
      if (wasLive) {
        input?.end(session.heard === "" ? null : session.heard);
      }
      fail(result.errorCode, result.message);
      return;
    }

    const final = result.text.trim();
    setText(final);
    setState("done");

    if (wasLive || onText === undefined) {
      input?.end(final === "" ? null : final);
      return;
    }

    if (final !== "") {
      onText(final);
    }
  };

  const finish = async (session: ISession): Promise<void> => {
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const recording = await session.recorder.stopRecording();
      const streamed = session.live === null ? null : await session.live.finish();
      const result: ISttTranscribeResult =
        streamed === null ? await transcribeWith(optionsRef.current)(recording, abort.signal) : { ok: true, text: streamed };

      if (!abort.signal.aborted) {
        deliver(result, session);
      }
    } catch (error: unknown) {
      if (!abort.signal.aborted) {
        session.live?.cancel();
        deliver({ ok: false, errorCode: sendErrorCode(error), ...messageOf(error) }, session);
      }
    } finally {
      if (abortRef.current === abort) {
        abortRef.current = null;
      }
      busyRef.current = false;
    }
  };

  const handlePressStart = (): void => {
    if (busyRef.current) {
      return;
    }

    const platform = recorderFor(optionsRef.current.recorder);

    if (!platform.ok) {
      fail(platform.errorCode);
      return;
    }

    busyRef.current = true;
    const session: ISession = { recorder: platform.recorder, live: null, heard: "", isCancelled: false };
    sessionRef.current = session;
    setErrorCode(undefined);
    setErrorMessage(undefined);
    setState("recording");

    // Opened before the microphone, so the engine gets ready while the user starts to speak.
    session.live =
      optionsRef.current.live?.(platform.recorder, (heard) => {
        if (!session.isCancelled) {
          session.heard = heard;
          optionsRef.current.input?.show(heard);
        }
      }) ?? null;

    void platform.recorder.startRecording().catch((error: unknown) => {
      if (sessionRef.current !== session) {
        return;
      }

      sessionRef.current = null;
      busyRef.current = false;
      session.isCancelled = true;
      session.live?.cancel();
      fail(startErrorCode(error), messageOf(error).message);
    });
  };

  const handlePressEnd = (): void => {
    const session = sessionRef.current;

    if (session === null) {
      return;
    }

    sessionRef.current = null;
    setState("transcribing");
    void finish(session);
  };

  const handleCancel = (): void => {
    const session = sessionRef.current;

    if (session === null) {
      return;
    }

    sessionRef.current = null;
    busyRef.current = false;
    session.isCancelled = true;
    session.live?.cancel();

    if (session.live !== null) {
      optionsRef.current.input?.end(null);
    }

    void session.recorder.stopRecording().catch(() => undefined);
    setState("idle");
  };

  return {
    state,
    isSupported: recorderFor(options.recorder).ok,
    text,
    ...(errorCode === undefined ? {} : { errorCode }),
    ...(errorMessage === undefined ? {} : { errorMessage }),
    handlePressStart,
    handlePressEnd,
    handleCancel,
  };
}

function messageOf(error: unknown): { message?: string } {
  return error instanceof Error && error.message !== "" ? { message: error.message } : {};
}

function startErrorCode(error: unknown): SttErrorCode {
  return isDomError(error, "NotAllowedError") ? "MIC_PERMISSION_DENIED" : "MIC_UNAVAILABLE";
}

function sendErrorCode(error: unknown): SttErrorCode {
  if (isDomError(error, "TimeoutError")) return "TIMEOUT";
  if (isDomError(error, "AbortError")) return "ENGINE_UNAVAILABLE";
  return "TRANSCRIPTION_FAILED";
}

// React Native has no DOMException, so errors are told apart by name; browsers' DOMExceptions are Errors too.
function isDomError(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name;
}
