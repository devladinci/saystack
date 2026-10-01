const LOOKAHEAD = 8;

const NOT_WORD = /[^\p{L}\p{N}]/gu;

const MARKS = /\p{M}/gu;

export function wordKey(word: string): string {
  return word.normalize("NFKD").replace(MARKS, "").replace(NOT_WORD, "").toLowerCase();
}

const findAhead = (keys: readonly string[], from: number, key: string): number => {
  const end = Math.min(keys.length, from + LOOKAHEAD);

  for (let index = from; index < end; index += 1) {
    if (keys[index] === key) {
      return index;
    }
  }

  return -1;
};

// For every spoken word, the index of the page word it reads, or -1 when the
// speech says something the page does not show (a rewrite, a skipped block).
export function alignWords(spoken: readonly string[], page: readonly string[]): number[] {
  const spokenKeys = spoken.map(wordKey);
  const pageKeys = page.map(wordKey);
  const matches = spoken.map(() => -1);
  let s = 0;
  let p = 0;

  while (s < spokenKeys.length && p < pageKeys.length) {
    const key = spokenKeys[s] ?? "";

    if (key === "") {
      s += 1;
      continue;
    }

    if (pageKeys[p] === "") {
      p += 1;
      continue;
    }

    if (pageKeys[p] === key) {
      matches[s] = p;
      s += 1;
      p += 1;
      continue;
    }

    const onPage = findAhead(pageKeys, p + 1, key);
    const inSpeech = findAhead(spokenKeys, s + 1, pageKeys[p] ?? "");

    if (onPage >= 0 && (inSpeech < 0 || onPage - p <= inSpeech - s)) {
      matches[s] = onPage;
      s += 1;
      p = onPage + 1;
    } else if (inSpeech >= 0) {
      s = inSpeech;
    } else {
      s += 1;
      p += 1;
    }
  }

  return matches;
}
