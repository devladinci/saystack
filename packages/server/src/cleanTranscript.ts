import type { CleanupErrorCode, ICleanupFn, ICleanupResult } from "@saystack/core";
import { needsCleanup } from "@saystack/core";

export interface ICleanupReport {
  heard: string;
  text: string;
  // skipped: nothing to fix. failed: the cleaner could not, or its answer was refused, so the transcript stands.
  outcome: "cleaned" | "unchanged" | "skipped" | "failed";
  errorCode?: CleanupErrorCode;
  message?: string;
  ms: number;
}

export interface ICleanupDeps {
  clean: ICleanupFn;
  // Names and terms that may be spoken, spelled the way they should be written.
  vocabulary?: readonly string[];
  // Whether a transcript is worth the round trip. By default one that has context or vocabulary to be checked
  // against, or that shows the marks of speech (needsCleanup).
  shouldClean?: (text: string, hints: ICleanupHintsGiven) => boolean;
  // How long a cleanup may take before the transcript goes out as it was heard.
  timeoutMs?: number;
  // Calls the cleaner once when a live dictation starts, so a model that loads on demand is ready by the
  // time the speaker stops. Worth it for a local model; a hosted one is always warm.
  warmUp?: boolean;
  // Only the end of a longer context is passed on, which is the most recent part of the conversation.
  maxContextChars?: number;
  onResult?: (report: ICleanupReport) => void;
}

export interface ICleanupHintsGiven {
  hasContext: boolean;
  hasVocabulary: boolean;
}

export interface ICleanupRequest {
  context?: string | undefined;
  languages: readonly string[];
  signal?: AbortSignal | undefined;
}

const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_MAX_CONTEXT_CHARS = 4000;

const defaultShouldClean = (text: string, { hasContext, hasVocabulary }: ICleanupHintsGiven): boolean =>
  text.trim().split(/\s+/).filter(Boolean).length > 1 && (hasContext || hasVocabulary || needsCleanup(text));

const attempt = async (cleanup: ICleanupDeps, heard: string, request: ICleanupRequest): Promise<ICleanupResult> => {
  const timeoutMs = cleanup.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = new AbortController();
  const context = request.context?.trim().slice(-(cleanup.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS)) ?? "";
  let timer: ReturnType<typeof setTimeout> | undefined;

  // The race holds the budget, and the caller's own deadline, even for a cleaner that does not listen to its signal.
  const timedOut = new Promise<ICleanupResult>((resolve) => {
    const giveUp = (message: string): void => {
      deadline.abort();
      resolve({ ok: false, errorCode: "CLEANUP_TIMEOUT", message });
    };

    timer = setTimeout(() => giveUp(`cleanup took longer than ${timeoutMs} ms`), timeoutMs);
    request.signal?.addEventListener("abort", () => giveUp("the request ended before the cleanup did"), { once: true });

    if (request.signal?.aborted === true) {
      giveUp("the request ended before the cleanup did");
    }
  });

  try {
    return await Promise.race([
      cleanup.clean({
        text: heard,
        languages: request.languages,
        signal: request.signal === undefined ? deadline.signal : AbortSignal.any([request.signal, deadline.signal]),
        ...(context === "" ? {} : { context }),
        ...(cleanup.vocabulary === undefined ? {} : { vocabulary: cleanup.vocabulary }),
      }),
      timedOut,
    ]);
  } catch (error: unknown) {
    return {
      ok: false,
      errorCode: "CLEANUP_FAILED",
      message: error instanceof Error ? error.message : "the cleaner threw",
    };
  } finally {
    clearTimeout(timer);
  }
};

// The transcript, cleaned up when there is a cleaner and it can. Whatever goes wrong, what was heard is returned.
export async function cleanTranscript(
  cleanup: ICleanupDeps | undefined,
  heard: string,
  request: ICleanupRequest,
): Promise<string> {
  if (cleanup === undefined) {
    return heard;
  }

  const startedAt = Date.now();
  const report = (outcome: ICleanupReport["outcome"], text: string, failure?: ICleanupResult): string => {
    try {
      cleanup.onResult?.({
        heard,
        text,
        outcome,
        ms: Date.now() - startedAt,
        ...(failure !== undefined && !failure.ok ? { errorCode: failure.errorCode, message: failure.message } : {}),
      });
    } catch {
      // A reporter that throws must not cost the user their transcript.
    }

    return text;
  };
  const hints: ICleanupHintsGiven = {
    hasContext: (request.context ?? "").trim() !== "",
    hasVocabulary: (cleanup.vocabulary ?? []).length > 0,
  };

  if (!(cleanup.shouldClean ?? defaultShouldClean)(heard, hints)) {
    return report("skipped", heard);
  }

  const result = await attempt(cleanup, heard, request);

  if (!result.ok) {
    return report("failed", heard, result);
  }

  return report(result.text === heard ? "unchanged" : "cleaned", result.text);
}

const WARM_UP_TEXT = "um hello hello";
const WARM_UP_TIMEOUT_MS = 60_000;

// Loads the cleaner's model before there is a transcript to clean. Nothing waits for it and nothing is kept.
export function warmCleaner(cleanup: ICleanupDeps | undefined, languages: readonly string[]): void {
  if (cleanup?.warmUp !== true) {
    return;
  }

  void Promise.resolve()
    .then(() => cleanup.clean({ text: WARM_UP_TEXT, languages, signal: AbortSignal.timeout(WARM_UP_TIMEOUT_MS) }))
    .catch(() => undefined);
}
