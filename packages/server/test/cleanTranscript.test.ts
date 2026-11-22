import type { ICleanupInput, ICleanupResult } from "@saystack/core";
import { describe, expect, it, vi } from "vitest";

import type { ICleanupReport } from "../src/cleanTranscript.js";
import { cleanTranscript, warmCleaner } from "../src/cleanTranscript.js";

const HEARD = "um so can you review the peer";
const REQUEST = { languages: ["en"] };

const cleanerThat = (answer: (input: ICleanupInput) => Promise<ICleanupResult> | ICleanupResult) => {
  const seen: ICleanupInput[] = [];

  return {
    seen,
    clean: async (input: ICleanupInput): Promise<ICleanupResult> => {
      seen.push(input);

      return answer(input);
    },
  };
};

describe("cleanTranscript", () => {
  it("returns what was heard when there is no cleaner", async () => {
    expect(await cleanTranscript(undefined, HEARD, REQUEST)).toBe(HEARD);
  });

  it("returns the cleaned text, and passes the context, the vocabulary and the languages on", async () => {
    const { seen, clean } = cleanerThat(() => ({ ok: true, text: "So can you review the PR?" }));

    const text = await cleanTranscript({ clean, vocabulary: ["saystack"] }, HEARD, {
      languages: ["en", "bg"],
      context: "  user: I opened PR 42.  ",
    });

    expect(text).toBe("So can you review the PR?");
    expect(seen[0]).toMatchObject({
      text: HEARD,
      context: "user: I opened PR 42.",
      vocabulary: ["saystack"],
      languages: ["en", "bg"],
    });
    expect(seen[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns what was heard when the cleaner fails, refuses or throws", async () => {
    const failing = cleanerThat(() => ({
      ok: false,
      errorCode: "CLEANUP_REJECTED",
      message: "the cleanup added words",
    }));
    const throwing = cleanerThat(() => {
      throw new Error("boom");
    });

    expect(await cleanTranscript({ clean: failing.clean }, HEARD, REQUEST)).toBe(HEARD);
    expect(await cleanTranscript({ clean: throwing.clean }, HEARD, REQUEST)).toBe(HEARD);
  });

  it("stops waiting at the time limit, and aborts the cleaner", async () => {
    let aborted = false;
    const { clean } = cleanerThat(
      (input) =>
        new Promise<ICleanupResult>(() => {
          input.signal?.addEventListener("abort", () => {
            aborted = true;
          });
        }),
    );
    const reports: ICleanupReport[] = [];

    const text = await cleanTranscript(
      { clean, timeoutMs: 20, onResult: (report) => reports.push(report) },
      HEARD,
      REQUEST,
    );

    expect(text).toBe(HEARD);
    expect(aborted).toBe(true);
    expect(reports[0]).toMatchObject({ outcome: "failed", errorCode: "CLEANUP_TIMEOUT", text: HEARD });
  });

  it("stops waiting when the request ends, even for a cleaner that ignores its signal", async () => {
    const request = new AbortController();
    const { clean } = cleanerThat(() => new Promise<ICleanupResult>(() => undefined));
    const reports: ICleanupReport[] = [];
    const pending = cleanTranscript({ clean, onResult: (report) => reports.push(report) }, HEARD, {
      ...REQUEST,
      signal: request.signal,
    });

    request.abort();

    expect(await pending).toBe(HEARD);
    expect(reports[0]).toMatchObject({ outcome: "failed", errorCode: "CLEANUP_TIMEOUT" });
  });

  it("aborts the cleaner when the request is aborted", async () => {
    const request = new AbortController();
    const { seen, clean } = cleanerThat(() => ({ ok: true, text: "So." }));

    await cleanTranscript({ clean }, HEARD, { ...REQUEST, signal: request.signal });
    request.abort();

    expect(seen[0]?.signal?.aborted).toBe(true);
  });

  it("skips a transcript with nothing to fix and nothing to check it against", async () => {
    const { seen, clean } = cleanerThat(() => ({ ok: true, text: "x" }));
    const reports: ICleanupReport[] = [];

    expect(
      await cleanTranscript({ clean, onResult: (report) => reports.push(report) }, "Sounds good, thanks.", REQUEST),
    ).toBe("Sounds good, thanks.");
    expect(seen).toHaveLength(0);
    expect(reports[0]?.outcome).toBe("skipped");
  });

  it("cleans a tidy transcript when there is context or vocabulary to check its terms against", async () => {
    const { seen, clean } = cleanerThat((input) => ({ ok: true, text: input.text }));
    const reports: ICleanupReport[] = [];
    const onResult = (report: ICleanupReport): number => reports.push(report);

    await cleanTranscript({ clean, onResult }, "Can you review the peer?", {
      ...REQUEST,
      context: "user: PR 42 is up",
    });
    await cleanTranscript({ clean, onResult, vocabulary: ["saystack"] }, "Open the say stack repo.", REQUEST);

    expect(seen).toHaveLength(2);
    expect(reports.map((report) => report.outcome)).toEqual(["unchanged", "unchanged"]);
  });

  it("never sends a single word, whatever the context", async () => {
    const { seen, clean } = cleanerThat(() => ({ ok: true, text: "x" }));

    expect(await cleanTranscript({ clean }, "No.", { ...REQUEST, context: "assistant: Push to main?" })).toBe("No.");
    expect(seen).toHaveLength(0);
  });

  it("lets the app decide what is worth cleaning", async () => {
    const { seen, clean } = cleanerThat(() => ({ ok: true, text: "Yes!" }));
    const shouldClean = vi.fn(() => true);

    expect(await cleanTranscript({ clean, shouldClean }, "Yes.", REQUEST)).toBe("Yes!");
    expect(shouldClean).toHaveBeenCalledWith("Yes.", { hasContext: false, hasVocabulary: false });
    expect(seen).toHaveLength(1);
  });

  it("passes only the end of a long context on", async () => {
    const { seen, clean } = cleanerThat(() => ({ ok: true, text: "So." }));

    await cleanTranscript({ clean, maxContextChars: 10 }, HEARD, {
      ...REQUEST,
      context: "a very old line. the newest",
    });

    expect(seen[0]?.context).toBe("the newest");
  });

  it("reports what happened, and survives a reporter that throws", async () => {
    const { clean } = cleanerThat(() => ({ ok: true, text: "So can you review the PR?" }));
    const reports: ICleanupReport[] = [];

    await cleanTranscript({ clean, onResult: (report) => reports.push(report) }, HEARD, REQUEST);
    const text = await cleanTranscript(
      {
        clean,
        onResult: () => {
          throw new Error("logger is down");
        },
      },
      HEARD,
      REQUEST,
    );

    expect(reports[0]).toMatchObject({ outcome: "cleaned", heard: HEARD, text: "So can you review the PR?" });
    expect(text).toBe("So can you review the PR?");
  });
});

describe("warmCleaner", () => {
  it("calls the cleaner once with a throwaway transcript, only when asked to", () => {
    const { seen, clean } = cleanerThat(() => ({ ok: true, text: "Hello." }));

    warmCleaner({ clean }, ["en"]);
    warmCleaner(undefined, ["en"]);

    expect(seen).toHaveLength(0);

    warmCleaner({ clean, warmUp: true }, ["en", "bg"]);

    return Promise.resolve().then(() => {
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({ languages: ["en", "bg"] });
      expect(seen[0]?.context).toBeUndefined();
    });
  });

  it("swallows a cleaner that fails or throws", async () => {
    const throwing = cleanerThat(() => {
      throw new Error("offline");
    });

    warmCleaner({ clean: throwing.clean, warmUp: true }, []);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(throwing.seen).toHaveLength(1);
  });
});
