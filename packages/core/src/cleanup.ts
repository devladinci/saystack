export type CleanupErrorCode =
  "CLEANUP_FAILED" | "CLEANUP_TIMEOUT" | "CLEANUP_BAD_RESPONSE" | "CLEANUP_RETRYABLE" | "CLEANUP_REJECTED";

export interface ICleanupInput {
  text: string;
  // What the conversation has been about, such as the last few messages. It is only read to recognise
  // names and terms the speech engine misheard; it is never answered or copied.
  context?: string;
  // Names and terms that may be spoken, spelled the way they should be written.
  vocabulary?: readonly string[];
  languages?: readonly string[];
  signal?: AbortSignal;
}

export type ICleanupResult = { ok: true; text: string } | { ok: false; errorCode: CleanupErrorCode; message: string };

export interface ICleanupFn {
  (input: ICleanupInput): Promise<ICleanupResult>;
}

const FILLER =
  /(?:^|[\s,;])(?:u+h+m*|u+m+|e+r+m+|e+h+m+|h+m{2,}|m+h+m+|ä+h+m*|ö+h+m*|e+u+h+|ъ{2,}м*|ъ+м+|э+м+|э{2,})(?=[\s,;.!?…]|$)/iu;
const STUTTER = /(?:^|\s)([\p{L}\p{N}'’]+),?\s+\1(?=[\s,;.!?…]|$)/iu;
const SENTENCE_END = /[.!?…。！？]/u;
const UNPUNCTUATED_MIN_WORDS = 12;
const LONG_MIN_WORDS = 30;

const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;

// Whether a transcript shows the marks of speech a writer would not have typed: filler sounds, a word said
// twice, a run with no capitals or no sentence ends, or simply a long dictation. A short, punctuated
// transcript does not, and is best left alone unless there is context to check its terms against.
export function needsCleanup(text: string): boolean {
  const trimmed = text.trim();
  const words = wordCount(trimmed);

  if (words < 2) {
    return false;
  }

  if (FILLER.test(trimmed) || STUTTER.test(trimmed)) {
    return true;
  }

  if (/\p{Ll}/u.test(trimmed) && !/\p{Lu}/u.test(trimmed)) {
    return true;
  }

  if (words >= UNPUNCTUATED_MIN_WORDS && !SENTENCE_END.test(trimmed)) {
    return true;
  }

  return words >= LONG_MIN_WORDS;
}

export interface IContextTurn {
  role: string;
  text: string;
}

export interface IConversationContextOptions {
  maxChars?: number;
  maxTurnChars?: number;
}

const CONTEXT_MAX_CHARS = 1500;
const CONTEXT_MAX_TURN_CHARS = 500;

// The end of a conversation as the context a cleanup reads: one line a turn, newest last, within a budget.
export function conversationContext(
  turns: readonly IContextTurn[],
  { maxChars = CONTEXT_MAX_CHARS, maxTurnChars = CONTEXT_MAX_TURN_CHARS }: IConversationContextOptions = {},
): string {
  const lines: string[] = [];
  let size = 0;

  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    const said = turn?.text.replace(/\s+/g, " ").trim() ?? "";

    if (turn === undefined || said === "") {
      continue;
    }

    const line = `${turn.role}: ${said.length > maxTurnChars ? `${said.slice(0, maxTurnChars).trimEnd()}…` : said}`;

    if (size + line.length > maxChars) {
      break;
    }

    lines.unshift(line);
    size += line.length + 1;
  }

  return lines.join("\n");
}
