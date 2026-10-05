const FIRST_CHUNK_CHARS = 80;

const MAX_CHUNK_CHARS = 300;

const CHUNK_GROWTH = 1.4;

const SUMMARY_MIN_CHARS = 600;

const CODE_FENCE = /```[\s\S]*?(?:```|$)/g;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const RULE = /^\s*(?:[-*_]\s*){3,}$/;
const LINE_MARKER = /^\s*(?:#{1,6}\s+|>\s?|[-*+]\s+|\d{1,3}[.)]\s+)/;
const IMAGE = /!\[[^\]]*\]\([^)]*\)/g;
const LINK = /\[([^\]]*)\]\([^)]*\)/g;
const URL =
  /\bhttps?:\/\/(?:www\.)?([\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*)(?::\d+)?(?:[/?#]\S*?)?(?=[.,;:!?)\]>"']*(?:\s|$))/gu;
const INLINE_CODE = /`([^`]*)`/g;
const HTML_TAG =
  /<!--[\s\S]*?-->|<\/?(?:a|abbr|b|blockquote|br|code|del|details|div|em|h[1-6]|hr|i|img|ins|kbd|li|mark|ol|p|pre|s|small|span|strong|sub|summary|sup|table|tbody|td|th|thead|tr|u|ul)\b[^<>]*>/gi;
const EMOJI =
  /\s*(?:(?![©®™])\p{Extended_Pictographic}|\p{Regional_Indicator})(?:[\uFE0F\u20E3]|\p{Emoji_Modifier}|\u200D(?:\p{Extended_Pictographic}|\p{Regional_Indicator}))*/gu;
const STRONG = /(\*\*|__)(.+?)\1/g;
const EMPHASIS = /(^|[^\w*])([*_])(\S(?:.*?\S)?)\2(?![\w*])/g;
const STRIKE = /~~(.+?)~~/g;
const SPACES = /\s+/g;
const SENTENCE_END = /[.!?…:;,]$/;
const SENTENCE = /[\s\S]*?[.!?…]+["'”’»)\]]*(?=\s|$)|[\s\S]+$/g;
const PLAIN = /^[\p{L}\p{M}\s.,!?;:'"’‘“”«»„()\-–—…]*$/u;

const cleanLine = (line: string): string =>
  line
    .replace(LINE_MARKER, "")
    .replace(IMAGE, "")
    .replace(LINK, "$1")
    .replace(URL, "$1")
    .replace(INLINE_CODE, "$1")
    .replace(HTML_TAG, "")
    .replace(EMOJI, "")
    .replace(STRONG, "$2")
    .replace(EMPHASIS, "$1$3")
    .replace(STRIKE, "$1")
    .replace(SPACES, " ")
    .trim();

const asSentence = (line: string): string => (SENTENCE_END.test(line) ? line : `${line}.`);

export function toSpeechText(markdown: string): string {
  return markdown
    .replace(CODE_FENCE, "\n")
    .split("\n")
    .filter((line) => !TABLE_ROW.test(line) && !RULE.test(line))
    .map(cleanLine)
    .filter(Boolean)
    .map(asSentence)
    .join(" ");
}

// What a reader sees of the speech, one block per paragraph, heading or list item; code and tables are left out.
export function toReadingBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  let lines: string[] = [];

  const flush = (): void => {
    if (lines.length > 0) {
      blocks.push(lines.join(" "));
      lines = [];
    }
  };

  for (const line of markdown.replace(CODE_FENCE, "\n\n").split("\n")) {
    if (line.trim() === "" || TABLE_ROW.test(line) || RULE.test(line)) {
      flush();
      continue;
    }

    const isOwnBlock = LINE_MARKER.test(line);

    if (isOwnBlock) {
      flush();
    }

    const cleaned = cleanLine(line);

    if (cleaned !== "") {
      lines.push(cleaned);
    }

    if (isOwnBlock) {
      flush();
    }
  }

  flush();

  return blocks;
}

export const hasSpeechText = (markdown: string): boolean => toSpeechText(markdown) !== "";

const hasCodeOrTable = (markdown: string): boolean =>
  markdown.includes("```") || markdown.split("\n").some((line) => TABLE_ROW.test(line));

export const needsSummary = (markdown: string): boolean =>
  hasCodeOrTable(markdown) || toSpeechText(markdown).length > SUMMARY_MIN_CHARS;

export const needsRewrite = (markdown: string): boolean =>
  hasCodeOrTable(markdown) || !PLAIN.test(toSpeechText(markdown));

const sentences = (text: string): string[] => (text.match(SENTENCE) ?? []).map((s) => s.trim()).filter(Boolean);

export function speechChunks(text: string, reserve = 0): string[] {
  const chunks: string[] = [];
  let current = "";
  // Anything the caller adds in front of a chunk — a style tag — counts against the same budget.
  let limit = Math.max(1, FIRST_CHUNK_CHARS - reserve);

  const flush = () => {
    chunks.push(current);
    current = "";
    limit = Math.max(1, Math.min(MAX_CHUNK_CHARS, Math.round(limit * CHUNK_GROWTH)) - reserve);
  };

  for (const sentence of sentences(text)) {
    const joined = current ? `${current} ${sentence}` : sentence;
    if (joined.length <= limit) {
      current = joined;
      continue;
    }
    if (current) flush();
    let rest = sentence;
    while (rest.length > limit) {
      const space = rest.lastIndexOf(" ", limit);
      const cut = space > 0 ? space : limit;
      current = rest.slice(0, cut);
      rest = rest.slice(cut).trim();
      flush();
    }
    current = rest;
  }
  if (current) chunks.push(current);

  return chunks;
}
