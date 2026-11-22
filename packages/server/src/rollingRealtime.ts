import type {
  ISttAdapter,
  ISttRealtimeAdapter,
  ISttRealtimeInput,
  ISttRealtimeSession,
  ISttTranscribeResult,
  SttErrorCode,
} from "@saystack/core";
import { alignWords, pcm16ToWav, REALTIME_PCM_RATE, wordKey } from "@saystack/core";

export interface IRollingRealtimeOptions {
  // The least new audio between two passes. Words show about two passes behind the voice.
  stepMs?: number;
  // One pass never covers more than this: a speaker who does not pause has the window closed for them.
  maxWindowMs?: number;
  // Audio below this level, from 0 to 1, counts as a pause.
  quietLevel?: number;
}

const BYTES_PER_MS = (REALTIME_PCM_RATE * 2) / 1000;

// A pause this long ends a window, and this much of it stays in front of the next one.
const PAUSE_MS = 1000;
const LEAD_MS = 300;

const MAX_FAILS = 3;

const TOO_SHORT: readonly SttErrorCode[] = ["EMPTY_AUDIO", "RECORDING_TOO_SHORT"];

const levelOf = (pcm: Uint8Array): number => {
  const samples = pcm.byteLength >> 1;

  if (samples === 0) {
    return 0;
  }

  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let sum = 0;

  for (let index = 0; index < samples; index += 1) {
    const sample = view.getInt16(index * 2, true);
    sum += sample * sample;
  }

  return Math.sqrt(sum / samples) / 32768;
};

const wordsOf = (text: string): string[] => text.split(/\s+/).filter((word) => word !== "");

const sharedStart = (before: readonly string[], now: readonly string[]): number => {
  const end = Math.min(before.length, now.length);
  let count = 0;

  while (count < end && wordKey(before[count] ?? "") === wordKey(now[count] ?? "")) {
    count += 1;
  }

  return count;
};

// Live words from an engine that only takes whole files: the audio since the last pause is transcribed again
// every step, and a word is sent once two passes in a row agree on it. Words are told apart by spaces.
export function createRollingRealtimeSttAdapter(
  stt: ISttAdapter,
  { stepMs = 500, maxWindowMs = 30_000, quietLevel = 0.004 }: IRollingRealtimeOptions = {},
): ISttRealtimeAdapter {
  const capabilities = { ...stt.capabilities, streaming: true, interimResults: true };
  const stepBytes = stepMs * BYTES_PER_MS;
  const maxWindowBytes = maxWindowMs * BYTES_PER_MS;

  const open = (input: ISttRealtimeInput): ISttRealtimeSession => {
    const aborter = new AbortController();
    const waiting: (() => void)[] = [];
    let audio: Uint8Array[] = [];
    let audioBytes = 0;
    let freshBytes = 0;
    let quietBytes = 0;
    let hasFreshVoice = false;
    let previous: string[] = [];
    let shown = 0;
    let sentKeys = "";
    let text = "";
    let fails = 0;
    let isPassing = false;
    let isStopping = false;
    let isOver = false;
    let handleDelta: ((delta: string, fullText: string) => void) | null = null;
    let handleError: ((errorCode: SttErrorCode, message?: string) => void) | null = null;

    const transcribe = (): Promise<ISttTranscribeResult> =>
      stt
        .transcribe({
          audio: pcm16ToWav(audio),
          mimeType: "audio/wav",
          filename: "audio.wav",
          signal: aborter.signal,
          ...(input.language === undefined ? {} : { language: input.language }),
        })
        .catch((): ISttTranscribeResult => ({ ok: false, errorCode: "TRANSCRIPTION_FAILED" }));

    const send = (words: readonly string[]): void => {
      if (words.length === 0) {
        return;
      }

      const delta = `${text === "" ? "" : " "}${words.join(" ")}`;

      sentKeys += words.map(wordKey).join("");
      text += delta;
      handleDelta?.(delta, text);
    };

    // Where the words not sent yet start in a new pass: after the last letter of what was sent. A pass can
    // add, drop, split or join words in the part already sent, so the place is found by the letters, not
    // by counting words.
    const unsentFrom = (words: readonly string[]): number => {
      const ends: number[] = [];
      let heard = "";

      for (const word of words) {
        heard += wordKey(word);
        ends.push(heard.length);
      }

      const end = alignWords([...sentKeys], [...heard]).reduce((last, match) => Math.max(last, match), -1) + 1;

      if (end === 0) {
        return Math.min(shown, words.length);
      }

      const last = ends.findIndex((length) => length >= end);

      return last < 0 ? words.length : last + 1;
    };

    const startWindow = (kept: Uint8Array[]): void => {
      audio = kept;
      audioBytes = kept.reduce((total, chunk) => total + chunk.byteLength, 0);
      previous = [];
      shown = 0;
      sentKeys = "";
    };

    // Every word is out and the speaker has paused: the next window starts at the end of the pause.
    const rest = (): void => {
      if (previous.length > shown || quietBytes < PAUSE_MS * BYTES_PER_MS) {
        return;
      }

      let from = audio.length;
      let kept = 0;

      while (from > 0 && kept < LEAD_MS * BYTES_PER_MS) {
        from -= 1;
        kept += audio[from]?.byteLength ?? 0;
      }

      startWindow(audio.slice(from));
      freshBytes = 0;
    };

    const take = (words: string[], heardChunks: number, heardBytes: number): void => {
      const agreed = sharedStart(previous, words);
      const from = unsentFrom(words);

      previous = words;

      if (heardBytes >= maxWindowBytes) {
        send(words.slice(from));
        startWindow(audio.slice(heardChunks));
        return;
      }

      send(words.slice(from, agreed));
      shown = Math.max(from, agreed);
      rest();
    };

    const end = (): void => {
      isOver = true;
      aborter.abort();

      for (const wake of waiting.splice(0)) {
        wake();
      }
    };

    const pass = async (): Promise<void> => {
      const heardChunks = audio.length;
      const heardBytes = audioBytes;

      isPassing = true;
      freshBytes = 0;
      hasFreshVoice = false;

      const result = await transcribe();

      isPassing = false;

      if (isOver) {
        return;
      }

      if (result.ok) {
        fails = 0;
        take(wordsOf(result.text), heardChunks, heardBytes);
      } else if (!TOO_SHORT.includes(result.errorCode)) {
        fails += 1;
        hasFreshVoice = true;

        if (fails >= MAX_FAILS) {
          handleError?.(result.errorCode, result.message);
          end();
          return;
        }
      }

      for (const wake of waiting.splice(0)) {
        wake();
      }

      tick();
    };

    const tick = (): void => {
      if (isOver || isStopping || isPassing || freshBytes < stepBytes) {
        return;
      }

      if (!hasFreshVoice && previous.length <= shown) {
        rest();
        return;
      }

      void pass();
    };

    const finish = async (): Promise<ISttTranscribeResult> => {
      if (isPassing) {
        await new Promise<void>((resolve) => {
          waiting.push(resolve);
        });
      }

      if (isOver) {
        return { ok: false, errorCode: "TRANSCRIPTION_FAILED", message: "the stream ended early" };
      }

      if (!hasFreshVoice && previous.length <= shown) {
        end();
        return { ok: true, text };
      }

      const result = await transcribe();

      if (isOver) {
        return { ok: false, errorCode: "TRANSCRIPTION_FAILED", message: "the stream ended early" };
      }

      if (result.ok) {
        const words = wordsOf(result.text);

        send(words.slice(unsentFrom(words)));
      }

      end();

      return result.ok || TOO_SHORT.includes(result.errorCode) ? { ok: true, text } : result;
    };

    let finished: Promise<ISttTranscribeResult> | null = null;

    input.signal?.addEventListener("abort", end, { once: true });

    return {
      capabilities,
      feedPcm16: (pcm) => {
        if (isOver || isStopping || pcm.byteLength === 0) {
          return;
        }

        audio.push(pcm);
        audioBytes += pcm.byteLength;
        freshBytes += pcm.byteLength;

        if (levelOf(pcm) < quietLevel) {
          quietBytes += pcm.byteLength;
        } else {
          quietBytes = 0;
          hasFreshVoice = true;
        }

        tick();
      },
      onDelta: (handler) => {
        handleDelta = handler;
      },
      onError: (handler) => {
        handleError = handler;
      },
      stop: () => {
        isStopping = true;
        finished ??= finish();

        return finished;
      },
      release: end,
    };
  };

  return {
    capabilities,
    openRealtime: (input) => Promise.resolve({ ok: true, session: open(input) }),
  };
}
