const SCRIPTS = [
  /\p{Script=Latin}/gu,
  /\p{Script=Cyrillic}/gu,
  /\p{Script=Greek}/gu,
  /\p{Script=Arabic}/gu,
  /\p{Script=Hebrew}/gu,
  /\p{Script=Devanagari}/gu,
  /\p{Script=Thai}/gu,
  /\p{Script=Hangul}/gu,
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu,
];

const SCRIPT_DRIFT = 0.25;
const MIN_KEPT_SHARE = 0.4;
const MAX_NEW_SHARE = 0.12;
// Speech that mixes languages can have a term in every few words ("пусни deploy-а на staging").
const MAX_TERM_SHARE = 0.4;
const MAX_TERMS = 4;
// A term may be one word longer than what was heard in its place ("merge request" for "мърджрекуест").
const TERM_SLACK = 1;
// A number written as one run ("5550199" for "555 0199") counts as said when it is at least this long.
const MIN_JOINED_DIGITS = 5;
const MAX_MOVED_SHARE = 0.2;
const MAX_MOVED = 2;
// No stretch of ten words may lose more than half of them for good.
const LOSS_WINDOW = 10;
const MAX_LOSS = 5;
const JOIN_SPAN = 4;
// Above this the comparison table no longer fits in a few megabytes; such a transcript is not cleaned at all.
const MAX_CELLS = 4_000_000;

export interface ICleanupHints {
  context?: string;
  vocabulary?: readonly string[];
}

const SYMBOLS = /[$€£¥₹₽₩₪₺%‰°]/gu;

// "1,350" and "1 350" are one number, and "cant" is "can't", on both sides of the comparison.
const wordsOf = (text: string): string[] =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/(?<=\d)[,.\s](?=\d{3}(?!\d))/g, "")
    .replace(/(?<=\p{L})['’](?=\p{L})/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

const symbolsOf = (text: string): string[] => text.match(SYMBOLS) ?? [];

const digitsOf = (words: readonly string[]): string[] => words.flatMap((word) => word.match(/\d+/g) ?? []);

const scriptShares = (text: string): number[] => {
  const counts = SCRIPTS.map((script) => (text.match(script) ?? []).length);
  const total = counts.reduce((sum, count) => sum + count, 0);

  return counts.map((count) => (total === 0 ? 0 : count / total));
};

// A grammar fix keeps the stem ("goes" → "go", "файлове" → "файла"), so a long shared start is the same word.
const isSameWord = (a: string, b: string): boolean => {
  if (a === b) {
    return true;
  }

  if (/\d/.test(a) || /\d/.test(b)) {
    return false;
  }

  const shorter = Math.min(a.length, b.length);
  const need = Math.max(3, Math.ceil(shorter * 0.6));

  if (shorter < need) {
    return false;
  }

  for (let index = 0; index < need; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }

  return true;
};

interface IAlignment {
  keptSource: boolean[];
  keptCleaned: boolean[];
}

// The longest run of words the two texts share in the same order.
const align = (source: readonly string[], cleaned: readonly string[]): IAlignment => {
  const columns = cleaned.length + 1;
  const table = new Uint16Array((source.length + 1) * columns);

  for (let row = source.length - 1; row >= 0; row -= 1) {
    for (let column = cleaned.length - 1; column >= 0; column -= 1) {
      table[row * columns + column] = isSameWord(source[row] ?? "", cleaned[column] ?? "")
        ? (table[(row + 1) * columns + column + 1] ?? 0) + 1
        : Math.max(table[(row + 1) * columns + column] ?? 0, table[row * columns + column + 1] ?? 0);
    }
  }

  const keptSource = source.map(() => false);
  const keptCleaned = cleaned.map(() => false);
  let row = 0;
  let column = 0;

  while (row < source.length && column < cleaned.length) {
    if (isSameWord(source[row] ?? "", cleaned[column] ?? "")) {
      keptSource[row] = true;
      keptCleaned[column] = true;
      row += 1;
      column += 1;
    } else if ((table[(row + 1) * columns + column] ?? 0) >= (table[row * columns + column + 1] ?? 0)) {
      row += 1;
    } else {
      column += 1;
    }
  }

  return { keptSource, keptCleaned };
};

// The most words any short stretch of the transcript lost for good. A word the speaker said again further on
// ("send it to Maria, sorry, I mean send it to Marta") is not lost when its first saying goes.
const heaviestLoss = (source: readonly string[], cleaned: readonly string[], kept: readonly boolean[]): number => {
  const written = new Set(cleaned);
  const lost = source.map(
    (word, index) => kept[index] !== true && !written.has(word) && !cleaned.some((other) => isSameWord(word, other)),
  );
  let heaviest = 0;
  let inWindow = 0;

  lost.forEach((isLost, index) => {
    inWindow += (isLost ? 1 : 0) - (index >= LOSS_WINDOW && lost[index - LOSS_WINDOW] === true ? 1 : 0);
    heaviest = Math.max(heaviest, inWindow);
  });

  return heaviest;
};

// "saystack" for "say stack", "README" for "read me": a term written as one word was still spoken.
const joinsOf = (source: readonly string[]): Set<string> => {
  const joins = new Set<string>();

  for (let start = 0; start < source.length; start += 1) {
    let joined = source[start] ?? "";

    for (let end = start + 1; end < Math.min(source.length, start + JOIN_SPAN); end += 1) {
      joined += source[end] ?? "";
      joins.add(joined);
    }
  }

  return joins;
};

interface IAdded {
  // Words the speaker never said.
  invented: number;
  // Words the speaker said, but not at this point: a repair such as "see if it's and how it works" →
  // "see if it works and how it works" says a word again.
  moved: number;
  fromHints: number;
  ownWords: string[];
}

// Walks the stretches between kept words: what the cleanup wrote there, and whether anything was said there.
// A term from the context or the vocabulary may only stand where the speaker said something else; put where
// nothing was said, it is an addition like any other.
const countAdded = (
  source: readonly string[],
  cleaned: readonly string[],
  { keptSource, keptCleaned }: IAlignment,
  terms: ReadonlySet<string>,
): IAdded => {
  const joins = joinsOf(source);
  const said = new Set(source);
  const added: IAdded = { invented: 0, moved: 0, fromHints: 0, ownWords: [] };
  let row = 0;
  let column = 0;

  while (row < source.length || column < cleaned.length) {
    let unsaid = 0;
    let termsHere = 0;

    while (row < source.length && keptSource[row] !== true) {
      unsaid += 1;
      row += 1;
    }

    while (column < cleaned.length && keptCleaned[column] !== true) {
      const word = cleaned[column] ?? "";
      column += 1;

      if (joins.has(word)) {
        continue;
      }

      if (terms.has(word) && unsaid > 0 && termsHere < unsaid + TERM_SLACK) {
        termsHere += 1;
        added.fromHints += 1;
        continue;
      }

      if (said.has(word) || source.some((spoken) => isSameWord(spoken, word))) {
        added.moved += 1;
      } else {
        added.invented += 1;
      }

      added.ownWords.push(word);
    }

    if (column < cleaned.length) {
      added.ownWords.push(cleaned[column] ?? "");
    }

    row += 1;
    column += 1;
  }

  return added;
};

// Why a cleaned transcript is not the message that was dictated, or null when it is.
export function checkCleanup(source: string, cleaned: string, hints: ICleanupHints = {}): string | null {
  if (/<\/?(?:transcript|context)\b/i.test(cleaned)) {
    return "the cleanup carries the prompt's own markup";
  }

  const sourceWords = wordsOf(source);
  const cleanedWords = wordsOf(cleaned);

  if (cleanedWords.length === 0) {
    return "the cleanup is empty";
  }

  if (sourceWords.length * cleanedWords.length > MAX_CELLS) {
    return "the transcript is too long to check";
  }

  const sourceRuns = digitsOf(sourceWords);
  const sourceDigits = sourceRuns.join("");
  const isSaid = (run: string): boolean =>
    sourceRuns.includes(run) || (run.length >= MIN_JOINED_DIGITS && sourceDigits.includes(run));

  if (!digitsOf(cleanedWords).every(isSaid)) {
    return "the cleanup added a number";
  }

  const sourceSymbols = symbolsOf(source);

  if (!symbolsOf(cleaned).every((symbol) => sourceSymbols.includes(symbol))) {
    return "the cleanup added a symbol";
  }

  const alignment = align(sourceWords, cleanedWords);
  const kept = alignment.keptSource.filter(Boolean).length;

  if (kept === 0 || kept < Math.floor(sourceWords.length * MIN_KEPT_SHARE)) {
    return "the cleanup lost most of what was said";
  }

  if (heaviestLoss(sourceWords, cleanedWords, alignment.keptSource) > MAX_LOSS) {
    return "the cleanup left a passage out";
  }

  const terms = new Set([...wordsOf(hints.context ?? ""), ...(hints.vocabulary ?? []).flatMap(wordsOf)]);
  const added = countAdded(sourceWords, cleanedWords, alignment, terms);

  if (added.invented > Math.max(1, Math.floor(cleanedWords.length * MAX_NEW_SHARE))) {
    return "the cleanup added words";
  }

  if (added.moved > Math.max(MAX_MOVED, Math.floor(cleanedWords.length * MAX_MOVED_SHARE))) {
    return "the cleanup rearranged what was said";
  }

  if (added.fromHints > Math.max(MAX_TERMS, Math.floor(cleanedWords.length * MAX_TERM_SHARE))) {
    return "the cleanup took too much from the context";
  }

  // A term spelled in another alphabet is still the speaker's word, so only their own words are compared.
  const sourceScripts = scriptShares(source);
  const cleanedScripts = scriptShares(added.ownWords.join(" "));

  if (sourceScripts.some((share, index) => Math.abs(share - (cleanedScripts[index] ?? 0)) > SCRIPT_DRIFT)) {
    return "the cleanup changed the language";
  }

  return null;
}
