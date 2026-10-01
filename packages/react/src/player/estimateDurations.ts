import type { ISpeechChunk } from "@saystack/core";

const DEFAULT_SECONDS_PER_CHAR = 0.065;

const PRIOR_CHARS = 120;

// A part that has not been synthesized yet has no duration, so it is guessed
// from its text. The pace heard so far only takes over once enough text has
// been heard; a one-word first part would otherwise skew every guess.
export function estimateDurations(chunks: readonly ISpeechChunk[]): number[] {
  const heard = chunks.filter((chunk) => chunk.duration > 0);
  const heardChars = heard.reduce((sum, chunk) => sum + chunk.text.length, 0);
  const heardSeconds = heard.reduce((sum, chunk) => sum + chunk.duration, 0);
  const secondsPerChar = (heardSeconds + PRIOR_CHARS * DEFAULT_SECONDS_PER_CHAR) / (heardChars + PRIOR_CHARS);

  return chunks.map((chunk) => (chunk.duration > 0 ? chunk.duration : chunk.text.length * secondsPerChar));
}
