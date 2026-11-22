const LOOKAHEAD = 8;

// Above this many pairs of words the table that finds the best match no longer fits in a few megabytes.
const MAX_CELLS = 6_000_000;

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

// One pass with a short look ahead: cheap, and good while speech and page stay close. A long stretch that only
// one side has (a table read as sentences, a block the speech skips) makes it lose its place.
const alignNearby = (spokenKeys: readonly string[], pageKeys: readonly string[]): number[] => {
  const matches = spokenKeys.map(() => -1);
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
};

// The longest run of words both sides share in the same order, taking the earliest match whenever several
// are as long. Whatever one side adds, however long, costs the other side nothing.
const alignBest = (spokenKeys: readonly string[], pageKeys: readonly string[]): number[] => {
  const columns = pageKeys.length + 1;
  const table = new Uint16Array((spokenKeys.length + 1) * columns);

  for (let s = spokenKeys.length - 1; s >= 0; s -= 1) {
    const key = spokenKeys[s];

    for (let p = pageKeys.length - 1; p >= 0; p -= 1) {
      table[s * columns + p] =
        key !== "" && key === pageKeys[p]
          ? (table[(s + 1) * columns + p + 1] ?? 0) + 1
          : Math.max(table[(s + 1) * columns + p] ?? 0, table[s * columns + p + 1] ?? 0);
    }
  }

  const matches = spokenKeys.map(() => -1);
  let s = 0;
  let p = 0;

  while (s < spokenKeys.length && p < pageKeys.length) {
    if (spokenKeys[s] !== "" && spokenKeys[s] === pageKeys[p]) {
      matches[s] = p;
      s += 1;
      p += 1;
    } else if ((table[(s + 1) * columns + p] ?? 0) >= (table[s * columns + p + 1] ?? 0)) {
      s += 1;
    } else {
      p += 1;
    }
  }

  return matches;
};

// For every spoken word, the index of the page word it reads, or -1 when the
// speech says something the page does not show (a rewrite, a skipped block).
export function alignWords(spoken: readonly string[], page: readonly string[]): number[] {
  const spokenKeys = spoken.map(wordKey);
  const pageKeys = page.map(wordKey);

  return spokenKeys.length * pageKeys.length <= MAX_CELLS && pageKeys.length < 65_535
    ? alignBest(spokenKeys, pageKeys)
    : alignNearby(spokenKeys, pageKeys);
}
