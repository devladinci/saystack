import { createPcm16Chunker, createResampler } from "@saystack/core";

import { sharedAudioContext } from "./audioContext.js";

export interface IPcmCaptureOptions {
  onChunk: (pcm: Uint8Array<ArrayBuffer>) => void;
  sampleRate?: number;
  chunkMs?: number;
  context?: AudioContext;
}

export interface IPcmCapture {
  stop(): void;
}

const TAP_NAME = "saystack-pcm-tap";

const TAP_SOURCE = `class SaystackPcmTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.block = new Float32Array(1024);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];

    for (let offset = 0; channel && offset < channel.length; ) {
      const count = Math.min(channel.length - offset, this.block.length - this.filled);
      this.block.set(channel.subarray(offset, offset + count), this.filled);
      this.filled += count;
      offset += count;

      if (this.filled === this.block.length) {
        this.port.postMessage(this.block.slice(0));
        this.filled = 0;
      }
    }

    return true;
  }
}

registerProcessor("${TAP_NAME}", SaystackPcmTap);`;

const PROCESSOR_FRAMES = 4096;

const taps = new WeakMap<AudioContext, Promise<boolean>>();

// Pages whose CSP refuses blob: scripts cannot load the worklet; they fall back to a ScriptProcessor.
const loadTap = (context: AudioContext): Promise<boolean> => {
  let loading = taps.get(context);

  if (loading === undefined) {
    loading =
      typeof AudioWorkletNode === "undefined" || context.audioWorklet === undefined
        ? Promise.resolve(false)
        : (async () => {
            const url = URL.createObjectURL(new Blob([TAP_SOURCE], { type: "text/javascript" }));

            try {
              await context.audioWorklet.addModule(url);
              return true;
            } catch {
              return false;
            } finally {
              URL.revokeObjectURL(url);
            }
          })();
    taps.set(context, loading);
  }

  return loading;
};

export function capturePcm(
  stream: MediaStream,
  { onChunk, sampleRate = 16000, chunkMs = 100, context }: IPcmCaptureOptions,
): IPcmCapture {
  const audioContext = context ?? sharedAudioContext();
  const resample = createResampler(audioContext.sampleRate, sampleRate);
  const chunker = createPcm16Chunker({ onChunk, sampleRate, chunkMs });
  let isStopped = false;
  let disconnect: (() => void) | null = null;

  const take = (input: Float32Array): void => {
    if (isStopped) {
      return;
    }

    chunker.push(resample(input));
  };

  const connect = (hasTap: boolean): void => {
    if (isStopped) {
      return;
    }

    const source = audioContext.createMediaStreamSource(stream);
    // The tap only runs while the graph pulls it, so it feeds the speakers at zero gain.
    const mute = audioContext.createGain();
    mute.gain.value = 0;
    mute.connect(audioContext.destination);

    if (hasTap) {
      const tap = new AudioWorkletNode(audioContext, TAP_NAME, { channelCount: 1, channelCountMode: "explicit" });
      tap.port.onmessage = (event: MessageEvent<Float32Array>) => take(event.data);
      source.connect(tap);
      tap.connect(mute);
      disconnect = () => {
        tap.port.onmessage = null;
        source.disconnect();
        tap.disconnect();
        mute.disconnect();
      };
      return;
    }

    const processor = audioContext.createScriptProcessor(PROCESSOR_FRAMES, 1, 1);
    processor.onaudioprocess = (event) => take(event.inputBuffer.getChannelData(0));
    source.connect(processor);
    processor.connect(mute);
    disconnect = () => {
      processor.onaudioprocess = null;
      source.disconnect();
      processor.disconnect();
      mute.disconnect();
    };
  };

  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }

  void loadTap(audioContext).then(connect);

  return {
    stop() {
      if (isStopped) {
        return;
      }

      chunker.flush();
      isStopped = true;
      disconnect?.();
      disconnect = null;
    },
  };
}
