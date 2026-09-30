import type { ISpeechChunk, ISpeechPosition } from "@saystack/core";
import { alignWords, toReadingBlocks, tokenizeWords } from "@saystack/core";

export interface IReadingWord {
  text: string;
  index: number;
}

export interface IReadingText {
  blocks: readonly (readonly IReadingWord[])[];
  words: readonly IReadingWord[];
}

export interface IReadAlongMap {
  chunkStarts: readonly number[];
  pageOf: readonly number[];
  spoken: readonly { chunkIndex: number; wordIndex: number }[];
}

export interface IReadAlongSeek {
  chunkIndex: number;
  seconds: number;
}

export function readingText(markdown: string): IReadingText {
  const words: IReadingWord[] = [];
  const blocks = toReadingBlocks(markdown).map((block) =>
    tokenizeWords(block).map((token) => {
      const word = { text: token.text, index: words.length };
      words.push(word);

      return word;
    }),
  );

  return { blocks, words };
}

export function mapReadAlong(chunks: readonly ISpeechChunk[], words: readonly IReadingWord[]): IReadAlongMap {
  const spoken: { chunkIndex: number; wordIndex: number }[] = [];
  const chunkStarts: number[] = [];
  const texts: string[] = [];

  chunks.forEach((chunk, chunkIndex) => {
    chunkStarts.push(spoken.length);
    tokenizeWords(chunk.text).forEach((token, wordIndex) => {
      spoken.push({ chunkIndex, wordIndex });
      texts.push(token.text);
    });
  });

  return {
    chunkStarts,
    pageOf: alignWords(
      texts,
      words.map((word) => word.text),
    ),
    spoken,
  };
}

// A spoken word the page does not show keeps the last word that it does.
export function pageWordAt({ chunkStarts, pageOf }: IReadAlongMap, { chunkIndex, wordIndex }: ISpeechPosition): number {
  const start = chunkStarts[chunkIndex];

  if (start === undefined || wordIndex < 0) {
    return -1;
  }

  for (let index = start + wordIndex; index >= 0; index -= 1) {
    const match = pageOf[index] ?? -1;

    if (match >= 0) {
      return match;
    }
  }

  return -1;
}

export function seekFor(
  { pageOf, spoken }: IReadAlongMap,
  chunks: readonly ISpeechChunk[],
  pageIndex: number,
): IReadAlongSeek | null {
  const spokenIndex = pageOf.indexOf(pageIndex);
  const target = spoken[spokenIndex];

  if (target === undefined) {
    return null;
  }

  const timing = chunks[target.chunkIndex]?.words[target.wordIndex];

  return { chunkIndex: target.chunkIndex, seconds: timing?.start ?? 0 };
}
