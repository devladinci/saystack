interface IFakeSource {
  buffer: unknown;
  onended: (() => void) | null;
  startedAt: number | null;
  offset: number;
  isStopped: boolean;
  connect: (node: unknown) => void;
  disconnect: () => void;
  start: (when: number, offset: number) => void;
  stop: () => void;
  end: () => void;
}

export interface IFakeAudio {
  context: AudioContext;
  sources: IFakeSource[];
  setTime: (seconds: number) => void;
  spectrum: Float32Array;
}

export function fakeAudio(duration = 2): IFakeAudio {
  let now = 0;
  const sources: IFakeSource[] = [];
  const spectrum = new Float32Array(1024).fill(-100);

  const node = () => ({ connect: () => undefined, disconnect: () => undefined });

  const context = {
    get currentTime() {
      return now;
    },
    sampleRate: 48000,
    state: "running",
    destination: node(),
    resume: async () => undefined,
    decodeAudioData: async () => ({
      duration,
      sampleRate: 1000,
      getChannelData: () => {
        const samples = new Float32Array(Math.round(duration * 1000));

        for (let index = 0; index < samples.length; index += 1) {
          samples[index] = 0.3 * Math.sin(index / 3);
        }

        return samples;
      },
    }),
    createBufferSource: () => {
      const source: IFakeSource = {
        buffer: null,
        onended: null,
        startedAt: null,
        offset: 0,
        isStopped: false,
        connect: () => undefined,
        disconnect: () => undefined,
        start: (_when, offset) => {
          source.startedAt = now;
          source.offset = offset;
        },
        stop: () => {
          source.isStopped = true;
          source.onended?.();
        },
        end: () => {
          source.onended?.();
        },
      };
      sources.push(source);

      return source;
    },
    createAnalyser: () => ({
      ...node(),
      fftSize: 2048,
      frequencyBinCount: 1024,
      smoothingTimeConstant: 0,
      getFloatFrequencyData: (target: Float32Array) => {
        target.set(spectrum);
      },
    }),
    createGain: () => ({ ...node(), gain: { value: 1 } }),
    createMediaStreamSource: () => node(),
  };

  return {
    context: context as unknown as AudioContext,
    sources,
    setTime: (seconds) => {
      now = seconds;
    },
    spectrum,
  };
}
