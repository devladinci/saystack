import type { IDecodedWav, ISpeechClip, ISpeechEnvelope } from "@saystack/core";
import { decodeWav, speechEnvelope } from "@saystack/core";
import type { AudioPlayer, AudioSample, AudioStatus } from "expo-audio";
import { createAudioPlayer } from "expo-audio";
import { File, Paths } from "expo-file-system";

export interface INativeClip extends ISpeechClip {
  readonly isPlaying: boolean;
  // The whole clip when it is a WAV, so levels follow the playhead; otherwise the newest samples the player reports.
  readonly decoded: IDecodedWav | null;
  readonly heard: Float32Array | null;
}

export interface INativeClipHooks {
  onPlay: (clip: INativeClip) => void;
  onRelease: (clip: INativeClip) => void;
}

const LOAD_TIMEOUT_MS = 4000;

let clips = 0;

const extensionOf = (audio: ArrayBuffer): string => {
  const head = new Uint8Array(audio.slice(0, 4));
  const tag = String.fromCharCode(...head);

  if (tag === "RIFF") return "wav";
  if (tag === "OggS") return "ogg";
  if (tag.startsWith("ID3") || (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0)) return "mp3";

  return "m4a";
};

const loaded = (player: AudioPlayer): Promise<number> =>
  new Promise((resolve) => {
    if (player.isLoaded && player.duration > 0) {
      resolve(player.duration);
      return;
    }

    const timer = setTimeout(() => {
      subscription.remove();
      resolve(player.duration);
    }, LOAD_TIMEOUT_MS);
    const subscription = player.addListener("playbackStatusUpdate", (status: AudioStatus) => {
      if (status.isLoaded && status.duration > 0) {
        clearTimeout(timer);
        subscription.remove();
        resolve(status.duration);
      }
    });
  });

export async function createNativeClip(audio: ArrayBuffer, hooks: INativeClipHooks): Promise<INativeClip> {
  const decoded = decodeWav(audio);
  clips += 1;
  const file = new File(Paths.cache, `saystack-speech-${clips}.${extensionOf(audio)}`);
  file.create({ overwrite: true });
  file.write(new Uint8Array(audio));
  const player = createAudioPlayer(file.uri, { updateInterval: 50 });
  const duration = decoded === null ? await loaded(player) : decoded.samples.length / decoded.sampleRate;
  const envelope: ISpeechEnvelope | null = decoded === null ? null : speechEnvelope(decoded.samples, decoded.sampleRate);
  const heard = decoded === null ? new Float32Array(4096) : null;
  let finish: (() => void) | null = null;
  let isPlaying = false;
  let hasEnded = false;
  let isReleased = false;

  const settle = (): void => {
    const resolve = finish;
    finish = null;
    isPlaying = false;
    resolve?.();
  };

  const status = player.addListener("playbackStatusUpdate", (next: AudioStatus) => {
    if (next.didJustFinish) {
      hasEnded = true;
      settle();
    }
  });

  const sampling =
    heard === null
      ? null
      : player.addListener("audioSampleUpdate", (sample: AudioSample) => {
          const frames = sample.channels[0]?.frames ?? [];
          const count = Math.min(frames.length, heard.length);
          heard.copyWithin(0, count);
          heard.set(frames.slice(frames.length - count), heard.length - count);
        });

  if (heard !== null) {
    player.setAudioSamplingEnabled(true);
  }

  const clip: INativeClip = {
    duration,
    ...(envelope === null ? {} : { envelope }),
    decoded,
    heard,
    get currentTime() {
      return isReleased ? 0 : player.currentTime;
    },
    get isPlaying() {
      return isPlaying;
    },
    play: () =>
      new Promise<void>((resolve) => {
        settle();
        finish = resolve;

        if (hasEnded) {
          hasEnded = false;
          void player.seekTo(0);
        }

        isPlaying = true;
        player.play();
        hooks.onPlay(clip);
      }),
    pause: () => {
      isPlaying = false;
      player.pause();
    },
    resume: () => {
      if (finish === null) {
        return;
      }

      isPlaying = true;
      player.play();
      hooks.onPlay(clip);
    },
    seek: (seconds) => {
      hasEnded = false;
      void player.seekTo(Math.min(duration, Math.max(0, seconds)));
    },
    stop: () => {
      player.pause();
      settle();
    },
    release: () => {
      if (isReleased) {
        return;
      }

      player.pause();
      settle();
      isReleased = true;
      status.remove();
      sampling?.remove();
      player.remove();
      hooks.onRelease(clip);

      if (file.exists) {
        file.delete();
      }
    },
  };

  return clip;
}
