import type { CleanupErrorCode, ICleanupFn, ICleanupInput, ICleanupResult } from "@saystack/core";
import { httpChatComplete } from "./chatCompletionsClient.js";
import { checkCleanup } from "./cleanupCheck.js";
import {
  buildCleanupSystemPrompt,
  buildCleanupUserPrompt,
  CLEANUP_ANSWER_SHAPE,
  contextTerms,
  soundAlikes,
} from "./cleanupPrompt.js";
import { readJsonAnswer } from "./jsonAnswer.js";
import type { IJsonSchemaFormat, ILlmChatClient, LlmErrorCode } from "./llmTypes.js";
import { normalizeBaseUrl } from "./sttAdapter.js";

export interface ITranscriptCleanerSpec {
  url: string;
  token?: string;
  model: string;
  // Replaces the built-in rules; the answer's JSON shape is still appended.
  prompt?: string;
  disableThinking?: boolean;
  timeoutSeconds?: number;
  // A longer transcript is left as it was heard: the model has to write all of it back.
  maxChars?: number;
  // Only the end of a longer context is sent, which is the most recent part of the conversation.
  maxContextChars?: number;
  // An answer the check refuses is asked for once more, with the reason; false keeps it to one call.
  retry?: boolean;
  chatClient?: ILlmChatClient;
}

const DEFAULT_TIMEOUT_SECONDS = 10;
const DEFAULT_MAX_CHARS = 4000;
const DEFAULT_MAX_CONTEXT_CHARS = 1500;

const CLEANUP_SCHEMA: IJsonSchemaFormat = {
  name: "transcript",
  schema: {
    type: "object",
    properties: { spoken_language: { type: "string" }, text: { type: "string" } },
    required: ["spoken_language", "text"],
    additionalProperties: false,
  },
};

const ERROR_CODES: Readonly<Record<LlmErrorCode, CleanupErrorCode>> = {
  LLM_UNAVAILABLE: "CLEANUP_FAILED",
  LLM_TIMEOUT: "CLEANUP_TIMEOUT",
  LLM_RETRYABLE: "CLEANUP_RETRYABLE",
  LLM_BAD_RESPONSE: "CLEANUP_BAD_RESPONSE",
};

const joinUrl = (base: string): string =>
  `${normalizeBaseUrl(base).replace(/\/chat\/completions$/, "")}/chat/completions`;

const escapeForPattern = (term: string): string => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The model is asked for the app's spelling and often gets the letters right and the capitals wrong.
const spellTerms = (text: string, vocabulary: readonly string[]): string =>
  vocabulary.reduce(
    (spelled, term) =>
      term.trim() === ""
        ? spelled
        : spelled.replace(
            new RegExp(`(?<![\\p{L}\\p{N}])${escapeForPattern(term.trim())}(?![\\p{L}\\p{N}])`, "giu"),
            term.trim(),
          ),
    text,
  );

const WORD = /[\p{L}\p{N}]+/gu;

// A term taken from the context is written the way the context writes it, when it only writes it one way.
const spellFromContext = (text: string, heard: string, context: string): string => {
  const said = new Set(heard.toLowerCase().match(WORD) ?? []);
  const spellings = new Map<string, string | null>();

  for (const word of context.match(WORD) ?? []) {
    const key = word.toLowerCase();
    const known = spellings.get(key);

    spellings.set(key, known === undefined || known === word ? word : null);
  }

  return text.replace(WORD, (word) => {
    const key = word.toLowerCase();

    return said.has(key) ? word : (spellings.get(key) ?? word);
  });
};

const LATIN_FOR_CYRILLIC: Readonly<Record<string, string>> = {
  а: "a",
  е: "e",
  о: "o",
  р: "p",
  с: "c",
  у: "y",
  х: "x",
  А: "A",
  В: "B",
  Е: "E",
  К: "K",
  М: "M",
  Н: "H",
  О: "O",
  Р: "P",
  С: "C",
  Т: "T",
  Х: "X",
};
const CYRILLIC_FOR_LATIN: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(LATIN_FOR_CYRILLIC).map(([cyrillic, latin]) => [latin, cyrillic]),
);
const LETTERS = /\p{L}+/gu;

const swapAll = (word: string, from: RegExp, table: Readonly<Record<string, string>>): string | null => {
  const letters = word.match(from) ?? [];

  return letters.every((letter) => table[letter] !== undefined)
    ? word.replace(from, (letter) => table[letter] ?? letter)
    : null;
};

// A model writing Cyrillic now and then slips in the Latin letter that looks the same ("бъгa" with a Latin a).
// The word reads right and is wrong to every search and spell check, so it is put back into one alphabet,
// unless the speaker's own word mixed them.
const fixLookalikes = (text: string, heard: string): string => {
  const said = new Set(heard.toLowerCase().match(LETTERS) ?? []);

  return text.replace(LETTERS, (word) => {
    const latin = (word.match(/\p{Script=Latin}/gu) ?? []).length;
    const cyrillic = (word.match(/\p{Script=Cyrillic}/gu) ?? []).length;

    if (latin === 0 || cyrillic === 0 || said.has(word.toLowerCase())) {
      return word;
    }

    return (
      (cyrillic >= latin
        ? swapAll(word, /\p{Script=Latin}/gu, CYRILLIC_FOR_LATIN)
        : swapAll(word, /\p{Script=Cyrillic}/gu, LATIN_FOR_CYRILLIC)) ?? word
    );
  });
};

// Keeps the end, starting at a line or a word, so the model never reads half a word as a term.
const tailOf = (context: string, maxChars: number): string => {
  const trimmed = context.trim();

  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  const tail = trimmed.slice(trimmed.length - maxChars);
  const lineBreak = tail.indexOf("\n");
  const space = tail.indexOf(" ");
  const start = lineBreak !== -1 && lineBreak < maxChars / 2 ? lineBreak : space;

  return tail.slice(start + 1).trim();
};

const failed = (errorCode: CleanupErrorCode, message: string): ICleanupResult => ({ ok: false, errorCode, message });

// Cleans up what a speech engine heard: punctuation, fillers, repeats, slips, and terms it misheard that the
// conversation or the app's vocabulary can settle. A result that is no longer the same message is refused, so
// the caller can always fall back to the transcript as it was heard.
export function createLlmTranscriptCleaner(spec: ITranscriptCleanerSpec): ICleanupFn {
  return (input) => cleanWithChat(spec, input);
}

async function cleanWithChat(spec: ITranscriptCleanerSpec, input: ICleanupInput): Promise<ICleanupResult> {
  const heard = input.text.trim();

  if (heard === "") {
    return failed("CLEANUP_REJECTED", "the transcript is empty");
  }

  if (heard.length > (spec.maxChars ?? DEFAULT_MAX_CHARS)) {
    return failed("CLEANUP_REJECTED", "the transcript is too long to clean up");
  }

  const vocabulary = input.vocabulary ?? [];
  const context =
    input.context === undefined ? "" : tailOf(input.context, spec.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS);
  const named = contextTerms(context);
  const rules =
    spec.prompt ??
    buildCleanupSystemPrompt({
      languages: input.languages ?? [],
      vocabulary,
      hasContext: context !== "",
      contextTerms: named,
    });
  const maybes = soundAlikes(heard, [...vocabulary, ...named]);
  const ask = async (refused?: string): Promise<ICleanupResult> => {
    const request = {
      model: spec.model,
      system: `${rules} ${CLEANUP_ANSWER_SHAPE}`,
      user: buildCleanupUserPrompt(heard, context, refused, maybes),
      timeoutMs: (spec.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000,
      jsonSchema: CLEANUP_SCHEMA,
      ...(spec.disableThinking !== undefined ? { disableThinking: spec.disableThinking } : {}),
      ...(spec.token !== undefined ? { token: spec.token } : {}),
      ...(input.signal !== undefined ? { signal: input.signal } : {}),
    };
    const response =
      spec.chatClient !== undefined
        ? await spec.chatClient.complete(request)
        : await httpChatComplete(request, joinUrl(spec.url));

    if (!response.ok) {
      return failed(ERROR_CODES[response.errorCode], response.message);
    }

    const answer = readJsonAnswer(response.content)?.text;

    if (typeof answer !== "string") {
      return failed("CLEANUP_BAD_RESPONSE", "engine did not return the expected JSON object");
    }

    const written = fixLookalikes(answer.replace(/\s+/g, " ").trim(), heard);
    const cleaned = spellTerms(spellFromContext(written, heard, context), vocabulary);
    const problem = checkCleanup(heard, cleaned, { context, vocabulary });

    return problem === null ? { ok: true, text: cleaned } : failed("CLEANUP_REJECTED", problem);
  };

  const first = await ask();

  // A refused answer is usually one slip, and a model told what it was rarely makes it twice.
  if (first.ok || first.errorCode !== "CLEANUP_REJECTED" || spec.retry === false || input.signal?.aborted === true) {
    return first;
  }

  const second = await ask(first.message);

  return second.ok ? second : first;
}
