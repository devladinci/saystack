export interface IPcm16ChunkerOptions {
  onChunk: (pcm: Uint8Array<ArrayBuffer>) => void;
  sampleRate?: number;
  chunkMs?: number;
}

export interface IPcm16Chunker {
  push(samples: ArrayLike<number>): void;
  flush(): void;
}

export interface IDecodedWav {
  samples: Float32Array;
  sampleRate: number;
}

// Area-averages the input into output samples, which also filters out what the lower rate cannot carry.
export function createResampler(fromRate: number, toRate: number): (input: Float32Array) => Float32Array {
  const step = fromRate / toRate;
  let pending = new Float32Array(0);
  let position = 0;

  return (input) => {
    const data = new Float32Array(pending.length + input.length);
    data.set(pending);
    data.set(input, pending.length);
    const count = Math.max(0, Math.floor((data.length - position) / step));
    const output = new Float32Array(count);

    for (let index = 0; index < count; index += 1) {
      const start = position + index * step;
      const end = start + step;
      let sum = 0;

      for (let sample = Math.floor(start); sample < Math.ceil(end); sample += 1) {
        sum += (data[sample] ?? 0) * (Math.min(end, sample + 1) - Math.max(start, sample));
      }

      output[index] = sum / step;
    }

    const consumed = position + count * step;
    const kept = Math.floor(consumed);
    pending = data.slice(kept);
    position = consumed - kept;

    return output;
  };
}

export function createPcm16Chunker({
  onChunk,
  sampleRate = 16000,
  chunkMs = 100,
}: IPcm16ChunkerOptions): IPcm16Chunker {
  const chunk = new DataView(new ArrayBuffer(Math.max(2, Math.round((sampleRate * chunkMs) / 1000)) * 2));
  let filled = 0;

  const flush = (): void => {
    if (filled > 0) {
      onChunk(new Uint8Array(chunk.buffer.slice(0, filled)));
      filled = 0;
    }
  };

  return {
    push(samples) {
      for (let index = 0; index < samples.length; index += 1) {
        const clamped = Math.max(-1, Math.min(1, samples[index] ?? 0));
        chunk.setInt16(filled, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
        filled += 2;

        if (filled === chunk.byteLength) {
          flush();
        }
      }
    },
    flush,
  };
}

export function pcm16ToFloat(pcm: Uint8Array): Float32Array {
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const samples = new Float32Array(Math.floor(pcm.byteLength / 2));

  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 0x8000;
  }

  return samples;
}

export function pcm16ToWav(chunks: readonly Uint8Array[], sampleRate = 16000): Uint8Array<ArrayBuffer> {
  const dataBytes = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const wav = new Uint8Array(44 + dataBytes);
  const view = new DataView(wav.buffer);
  const ascii = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (const chunk of chunks) {
    wav.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return wav;
}

const tagAt = (view: DataView, offset: number): string =>
  String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );

const sampleAt = (view: DataView, offset: number, format: number, bits: number): number => {
  if (format === 3 && bits === 32) {
    return view.getFloat32(offset, true);
  }

  if (bits === 16) {
    return view.getInt16(offset, true) / 0x8000;
  }

  if (bits === 32) {
    return view.getInt32(offset, true) / 0x80000000;
  }

  if (bits === 24) {
    const value = view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getInt8(offset + 2) << 16);

    return value / 0x800000;
  }

  return (view.getUint8(offset) - 128) / 128;
};

// The first channel of a PCM or float WAV; null for anything else, such as compressed audio.
export function decodeWav(audio: ArrayBuffer): IDecodedWav | null {
  const view = new DataView(audio);

  if (view.byteLength < 12 || tagAt(view, 0) !== "RIFF" || tagAt(view, 8) !== "WAVE") {
    return null;
  }

  let offset = 12;
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;

  while (offset + 8 <= view.byteLength) {
    const tag = tagAt(view, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;

    if (tag === "fmt " && body + 16 <= view.byteLength) {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);

      if (format === 0xfffe && size >= 26) {
        format = view.getUint16(body + 24, true);
      }
    }

    if (tag === "data") {
      const isReadable = (format === 1 && [8, 16, 24, 32].includes(bits)) || (format === 3 && bits === 32);

      if (!isReadable || channels < 1 || sampleRate <= 0) {
        return null;
      }

      const frameBytes = (bits / 8) * channels;
      const end = Math.min(view.byteLength, body + size);
      const samples = new Float32Array(Math.floor((end - body) / frameBytes));

      for (let index = 0; index < samples.length; index += 1) {
        samples[index] = sampleAt(view, body + index * frameBytes, format, bits);
      }

      return { samples, sampleRate };
    }

    offset = body + size + (size % 2);
  }

  return null;
}
