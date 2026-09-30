import { describe, expect, it } from "vitest";

import { createPcm16Chunker, createResampler, decodeWav, pcm16ToFloat, pcm16ToWav } from "../src/audio/pcm.js";

const tone = (length: number, value = 0.5) => new Float32Array(length).fill(value);

describe("createResampler", () => {
  it("turns 48 kHz into 16 kHz across uneven blocks", () => {
    const resample = createResampler(48000, 16000);
    const lengths = [1000, 333, 2667, 800].map((length) => resample(tone(length)).length);

    expect(lengths.reduce((sum, length) => sum + length, 0)).toBe(1600);
    expect(Array.from(resample(tone(30, 0.25)))).toEqual(new Array(10).fill(0.25));
  });

  it("averages a 44.1 kHz input without losing level", () => {
    const resample = createResampler(44100, 16000);
    const output = resample(tone(4410, 0.4));

    expect(output.length).toBe(1600);
    expect(Math.max(...Array.from(output))).toBeCloseTo(0.4, 5);
    expect(Math.min(...Array.from(output))).toBeCloseTo(0.4, 5);
  });
});

describe("createPcm16Chunker", () => {
  it("cuts 100 ms chunks and flushes the rest", () => {
    const chunks: Uint8Array[] = [];
    const chunker = createPcm16Chunker({ onChunk: (pcm) => chunks.push(pcm) });

    chunker.push(tone(1600 + 100));
    chunker.flush();
    chunker.flush();

    expect(chunks.map((chunk) => chunk.byteLength)).toEqual([3200, 200]);
    expect(new DataView(chunks[0]?.buffer ?? new ArrayBuffer(2)).getInt16(0, true)).toBe(Math.floor(0.5 * 0x7fff));
  });

  it("clips what is louder than full scale", () => {
    const chunks: Uint8Array[] = [];
    const chunker = createPcm16Chunker({ onChunk: (pcm) => chunks.push(pcm), chunkMs: 1 });

    chunker.push([2, -2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

    expect(Array.from(pcm16ToFloat(chunks[0] ?? new Uint8Array(0)).slice(0, 2))).toEqual([0x7fff / 0x8000, -1]);
  });
});

describe("WAV", () => {
  it("round-trips PCM16", () => {
    const chunks: Uint8Array[] = [];
    const chunker = createPcm16Chunker({ onChunk: (pcm) => chunks.push(pcm), sampleRate: 16000 });
    chunker.push(Float32Array.from({ length: 800 }, (_, index) => Math.sin(index / 10) * 0.5));
    chunker.flush();

    const decoded = decodeWav(pcm16ToWav(chunks, 16000).buffer);

    expect(decoded?.sampleRate).toBe(16000);
    expect(decoded?.samples.length).toBe(800);
    expect(decoded?.samples[50]).toBeCloseTo(Math.sin(5) * 0.5, 3);
  });

  it("reads the first channel of float stereo, past other chunks", () => {
    const frames = 4;
    const buffer = new ArrayBuffer(12 + 8 + 16 + 8 + 4 + 8 + frames * 8);
    const view = new DataView(buffer);
    const ascii = (offset: number, text: string) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    ascii(0, "RIFF");
    ascii(8, "WAVE");
    ascii(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 3, true);
    view.setUint16(22, 2, true);
    view.setUint32(24, 24000, true);
    view.setUint16(34, 32, true);
    ascii(36, "LIST");
    view.setUint32(40, 4, true);
    ascii(48, "data");
    view.setUint32(52, 0xffffffff, true);
    [0.25, -0.5, 0.75, -1].forEach((value, index) => {
      view.setFloat32(56 + index * 8, value, true);
      view.setFloat32(60 + index * 8, 9, true);
    });

    expect(decodeWav(buffer)).toEqual({ samples: Float32Array.from([0.25, -0.5, 0.75, -1]), sampleRate: 24000 });
  });

  it("gives up on audio it cannot read", () => {
    expect(decodeWav(new TextEncoder().encode("ID3 not a wav file").buffer)).toBeNull();
  });
});
