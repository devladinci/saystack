import { hasSpeechText, needsSummary, speechChunks, toSpeechText } from "./text.js";
import { estimateWordTimings, wordAt, wordTimingsFromMarks } from "./timing.js";
import type { ISpeechMark, IWordTiming } from "./timing.js";
import type {
  ISpeechChunk,
  ISpeechClip,
  ISpeechClipResult,
  ISpeechPosition,
  ISpeechState,
  ITtsDriver,
  ITtsSynthesizeInput,
  TtsErrorCode,
  TtsPhase,
} from "./types.js";

export interface ISpeechOptions {
  readonly refAudio?: string;
  readonly refText?: string;
}

export interface ISpeechSessionOptions {
  readonly rewrite?: ((markdown: string, signal: AbortSignal) => Promise<string | null>) | undefined;
  readonly shouldRewrite?: ((markdown: string) => boolean) | undefined;
}

export type ISpeechOutcome = { ok: true } | { ok: false; errorCode: TtsErrorCode; message: string };

type Listener = () => void;

export interface ISpeechSession {
  readonly state: ISpeechState;
  subscribe(listener: Listener): () => void;
  speak(markdown: string, options?: ISpeechOptions): Promise<ISpeechOutcome>;
  stop(): void;
  replay(): void;
  pause(): void;
  resume(): void;
  seek(chunkIndex: number, seconds?: number): void;
  position(): ISpeechPosition;
}

type IChunkAudio =
  | { ok: true; audio: ArrayBuffer; marks?: readonly ISpeechMark[] }
  | { ok: false; errorCode: TtsErrorCode; message: string };

interface ICachedAudio {
  promise: Promise<IChunkAudio>;
  isSettled: boolean;
}

interface IRun {
  readonly markdown: string;
  readonly options: ISpeechOptions;
  readonly audio: Map<number, ICachedAudio>;
  texts: readonly string[];
  controller: AbortController;
  playback: number;
  settle: (outcome: ISpeechOutcome) => void;
}

const ENGINE_CODES: ReadonlySet<TtsErrorCode> = new Set([
  "MODEL_NOT_FOUND",
  "BAD_TOKEN",
  "TTS_UNAVAILABLE",
  "TTS_REJECTED_INPUT",
  "TTS_RETRYABLE",
  "TTS_FAILED",
  "TTS_TIMEOUT",
  "TTS_UNSUPPORTED_MEDIA",
]);

const EMPTY_MESSAGE = "nothing speakable in the text";

const IDLE: ISpeechState = { phase: "idle", text: "", errorCode: null, errorMessage: null, chunks: [], chunkIndex: -1 };

const messageOf = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message.length > 0 ? error.message : fallback;

function wordsFor(text: string, clip: ISpeechClip, marks?: readonly ISpeechMark[]): readonly IWordTiming[] {
  const duration = clip.duration ?? 0;

  if (marks !== undefined && marks.length > 0) {
    return wordTimingsFromMarks(text, marks, duration);
  }

  if (clip.envelope !== undefined) {
    return estimateWordTimings(text, clip.envelope);
  }

  if (duration > 0) {
    return estimateWordTimings(text, { duration, speechStart: 0, speechEnd: duration, pauses: [] });
  }

  return [];
}

export function createSpeechSession(driver: ITtsDriver, sessionOptions: ISpeechSessionOptions = {}): ISpeechSession {
  const listeners = new Set<Listener>();
  let state: ISpeechState = IDLE;
  let run: IRun | null = null;
  let clip: ISpeechClip | null = null;
  let lastTime = 0;
  let isPauseRequested = false;

  const update = (patch: Partial<ISpeechState>): void => {
    state = { ...state, ...patch };

    for (const listener of listeners) {
      listener();
    }
  };

  const releaseClip = (): void => {
    if (clip === null) {
      return;
    }

    const current = clip;
    clip = null;
    lastTime = current.currentTime ?? current.duration ?? 0;
    current.stop();
    current.release();
  };

  const isLive = (current: IRun, playback: number): boolean =>
    run === current && current.playback === playback && !current.controller.signal.aborted;

  const fail = (current: IRun, errorCode: TtsErrorCode, message: string): void => {
    releaseClip();
    update({ phase: "error", errorCode, errorMessage: message });
    current.settle({ ok: false, errorCode, message });
  };

  const synthesize = (current: IRun, index: number): Promise<IChunkAudio> => {
    const cached = current.audio.get(index);

    if (cached !== undefined) {
      return cached.promise;
    }

    const input: ITtsSynthesizeInput = {
      text: current.texts[index] ?? "",
      signal: current.controller.signal,
      ...(current.options.refAudio !== undefined && current.options.refText !== undefined
        ? { refAudio: current.options.refAudio, refText: current.options.refText }
        : {}),
    };

    const pending = driver.synthesize(input).then(
      (result): IChunkAudio => {
        if (!result.ok) {
          const errorCode = ENGINE_CODES.has(result.errorCode) ? result.errorCode : "TTS_FAILED";

          return { ok: false, errorCode, message: result.message };
        }

        return result.marks === undefined
          ? { ok: true, audio: result.audio }
          : { ok: true, audio: result.audio, marks: result.marks };
      },
      (error: unknown): IChunkAudio => ({
        ok: false,
        errorCode: "TTS_FAILED",
        message: messageOf(error, "synthesis failed"),
      }),
    );

    const entry: ICachedAudio = { promise: pending, isSettled: false };
    current.audio.set(index, entry);

    void pending.then((result) => {
      entry.isSettled = true;

      if (!result.ok && current.audio.get(index) === entry) {
        current.audio.delete(index);
      }
    });

    return pending;
  };

  const createClip = (audio: ArrayBuffer): Promise<ISpeechClipResult> =>
    driver.createClip(audio).catch((error: unknown): ISpeechClipResult => ({
      ok: false,
      errorCode: "TTS_UNSUPPORTED_MEDIA",
      message: messageOf(error, "the audio could not be decoded"),
    }));

  const playChunk = async (current: IRun, playback: number, index: number, offset: number): Promise<boolean> => {
    const audio = await synthesize(current, index);

    if (!isLive(current, playback)) {
      return false;
    }

    if (!audio.ok) {
      fail(current, audio.errorCode, audio.message);
      return false;
    }

    if (index + 1 < current.texts.length) {
      void synthesize(current, index + 1);
    }

    const built = await createClip(audio.audio);

    if (!isLive(current, playback)) {
      if (built.ok) {
        built.clip.release();
      }
      return false;
    }

    if (!built.ok) {
      fail(current, built.errorCode, built.message);
      return false;
    }

    clip = built.clip;

    if (offset > 0) {
      built.clip.seek?.(offset);
    }

    const chunks = state.chunks.map((chunk, chunkIndex): ISpeechChunk =>
      chunkIndex === index
        ? { text: chunk.text, words: wordsFor(chunk.text, built.clip, audio.marks), duration: built.clip.duration ?? 0 }
        : chunk,
    );

    const playing = built.clip.play();
    let phase: TtsPhase = "playing";

    if (isPauseRequested && built.clip.pause !== undefined) {
      built.clip.pause();
      phase = "paused";
    }

    isPauseRequested = false;
    update({ phase, chunks, chunkIndex: index });
    await playing;

    if (!isLive(current, playback)) {
      return false;
    }

    releaseClip();
    return true;
  };

  const play = async (current: IRun, from: number, offset: number): Promise<void> => {
    current.playback += 1;
    const playback = current.playback;
    isPauseRequested = false;
    releaseClip();
    update({ phase: "loading", errorCode: null, errorMessage: null });

    try {
      for (let index = from; index < current.texts.length; index += 1) {
        const isPlayed = await playChunk(current, playback, index, index === from ? offset : 0);

        if (!isPlayed) {
          return;
        }
      }
    } catch (error: unknown) {
      if (isLive(current, playback)) {
        fail(current, "TTS_FAILED", messageOf(error, "playback failed"));
      }
      return;
    }

    update({ phase: "done" });
    current.settle({ ok: true });
  };

  const restart = (current: IRun, from: number, offset: number): void => {
    if (current.controller.signal.aborted) {
      current.controller = new AbortController();
    }

    void play(current, from, offset);
  };

  const cancel = (): void => {
    const current = run;

    if (current === null) {
      return;
    }

    current.playback += 1;
    current.controller.abort();
    current.settle({ ok: true });
    isPauseRequested = false;
    releaseClip();

    for (const [index, entry] of current.audio) {
      if (!entry.isSettled) {
        current.audio.delete(index);
      }
    }
  };

  const spokenSource = async (markdown: string, signal: AbortSignal): Promise<string> => {
    const { rewrite, shouldRewrite = needsSummary } = sessionOptions;

    if (rewrite === undefined || !shouldRewrite(markdown)) {
      return markdown;
    }

    try {
      const rewritten = await rewrite(markdown, signal);

      return rewritten !== null && hasSpeechText(rewritten) ? rewritten : markdown;
    } catch {
      return markdown;
    }
  };

  const speak = async (markdown: string, options: ISpeechOptions = {}): Promise<ISpeechOutcome> => {
    if (!hasSpeechText(markdown) && sessionOptions.rewrite === undefined) {
      return { ok: false, errorCode: "EMPTY_TEXT", message: EMPTY_MESSAGE };
    }

    cancel();

    let resolveOutcome: (outcome: ISpeechOutcome) => void = () => undefined;
    const outcome = new Promise<ISpeechOutcome>((resolve) => {
      resolveOutcome = resolve;
    });
    let isSettled = false;

    const current: IRun = {
      markdown,
      options,
      audio: new Map(),
      texts: [],
      controller: new AbortController(),
      playback: 0,
      settle: (value) => {
        if (isSettled) {
          return;
        }
        isSettled = true;
        resolveOutcome(value);
      },
    };

    run = current;
    lastTime = 0;
    update({ phase: "loading", text: markdown, errorCode: null, errorMessage: null, chunks: [], chunkIndex: -1 });

    const source = await spokenSource(markdown, current.controller.signal);

    if (run !== current || current.controller.signal.aborted) {
      return outcome;
    }

    const texts = speechChunks(toSpeechText(source));

    if (texts.length === 0) {
      fail(current, "EMPTY_TEXT", EMPTY_MESSAGE);
      return outcome;
    }

    current.texts = texts;
    update({ chunks: texts.map((text): ISpeechChunk => ({ text, words: [], duration: 0 })) });
    void play(current, 0, 0);

    return outcome;
  };

  const stop = (): void => {
    cancel();
    update({ phase: "idle", errorCode: null, errorMessage: null, chunkIndex: -1 });
  };

  const replay = (): void => {
    const current = run;

    if (current === null) {
      return;
    }

    if (current.texts.length === 0) {
      void speak(current.markdown, current.options);
      return;
    }

    restart(current, 0, 0);
  };

  const pause = (): void => {
    if (state.phase !== "playing") {
      return;
    }

    if (clip === null) {
      isPauseRequested = true;
      update({ phase: "paused" });
      return;
    }

    if (clip.pause === undefined) {
      return;
    }

    clip.pause();
    update({ phase: "paused" });
  };

  const resume = (): void => {
    if (state.phase !== "paused") {
      return;
    }

    if (isPauseRequested) {
      isPauseRequested = false;
      update({ phase: "playing" });
      return;
    }

    if (clip?.resume === undefined) {
      return;
    }

    clip.resume();
    update({ phase: "playing" });
  };

  const seek = (chunkIndex: number, seconds = 0): void => {
    const current = run;

    if (current === null || chunkIndex < 0 || chunkIndex >= current.texts.length) {
      return;
    }

    const duration = state.chunks[chunkIndex]?.duration ?? 0;

    if (duration > 0 && seconds >= duration && chunkIndex + 1 < current.texts.length) {
      seek(chunkIndex + 1, 0);
      return;
    }

    const offset = Math.max(0, duration > 0 ? Math.min(seconds, duration) : seconds);
    const isOnChunk = (state.phase === "playing" || state.phase === "paused") && chunkIndex === state.chunkIndex;

    if (isOnChunk && clip?.seek !== undefined) {
      clip.seek(offset);
      update({});
      return;
    }

    restart(current, chunkIndex, offset);
  };

  const position = (): ISpeechPosition => {
    const chunk = state.chunks[state.chunkIndex];

    if (chunk === undefined) {
      return { chunkIndex: state.chunkIndex, time: 0, duration: 0, wordIndex: -1 };
    }

    const time = clip?.currentTime ?? (state.phase === "done" ? chunk.duration : lastTime);

    return { chunkIndex: state.chunkIndex, time, duration: chunk.duration, wordIndex: wordAt(chunk.words, time) };
  };

  return {
    get state(): ISpeechState {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    speak,
    stop,
    replay,
    pause,
    resume,
    seek,
    position,
  };
}
