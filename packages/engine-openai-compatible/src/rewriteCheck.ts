import { toSpeechText } from "@saystack/core";

const RUN = /\d+/g;
const NUMBER = /\d+(?:[.,:/\u00A0\u202F ]\d+)*/g;
const DATE = /\b\d{1,4}([./-])\d{1,2}\1\d{1,4}\b/g;
const INLINE_CODE = /`[^`]*`/g;
const CLEAR_SCRIPT_SHARE = 0.7;

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

const runsOf = (text: string): string[] => (text.match(RUN) ?? []).map((run) => run.replace(/^0+(?=\d)/, ""));

const numbersOf = (text: string): string[] => (text.match(NUMBER) ?? []).map((number) => number.replace(/\D/g, ""));

const isFoundIn = (text: string): ((run: string) => boolean) => {
  const runs = runsOf(text);
  const numbers = numbersOf(text);

  return (run) => runs.includes(run) || numbers.some((number) => number.includes(run));
};

// Inside a numeric date the day and month may become words ("5 October"); the year must stay.
const withoutDateWords = (text: string): string =>
  text.replace(DATE, (date) =>
    date
      .split(/[./-]/)
      .filter((part) => Number(part) > 12)
      .join(" "),
  );

const clearScriptOf = (text: string): number => {
  const counts = SCRIPTS.map((script) => (text.match(script) ?? []).length);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const top = Math.max(...counts);

  return total > 0 && top / total >= CLEAR_SCRIPT_SHARE ? counts.indexOf(top) : -1;
};

export function checkRewrite(source: string, rewrite: string): string | null {
  if (!runsOf(rewrite).every(isFoundIn(source))) {
    return "the rewrite changed a number";
  }

  const spoken = withoutDateWords(toSpeechText(source.replace(INLINE_CODE, " ")));

  if (!runsOf(spoken).every(isFoundIn(rewrite))) {
    return "the rewrite left out a number";
  }

  const sourceScript = clearScriptOf(toSpeechText(source));
  const rewriteScript = clearScriptOf(rewrite);

  if (sourceScript !== -1 && rewriteScript !== -1 && sourceScript !== rewriteScript) {
    return "the rewrite changed the language";
  }

  return null;
}
