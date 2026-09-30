import type { ISpeechClipResult, ITtsDriver, ITtsSynthesizeResult } from "@saystack/core";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReadAloudPlayer } from "../src/ReadAloudPlayer.js";
import { ReadAloudProvider } from "../src/ReadAloudProvider.js";
import type { IReadAloud } from "../src/useReadAloud.js";
import { useReadAloud } from "../src/useReadAloud.js";
import type { IReadAloudMessage } from "../src/useReadAloudMessage.js";
import { useReadAloudMessage } from "../src/useReadAloudMessage.js";

interface IFakeDriver {
  driver: ITtsDriver;
  synthesize: ReturnType<typeof vi.fn>;
  finishPlaying: () => void;
}

function fakeDriver(result?: ITtsSynthesizeResult): IFakeDriver {
  const endings: (() => void)[] = [];
  const synthesize = vi.fn(
    async (): Promise<ITtsSynthesizeResult> => result ?? { ok: true, audio: new ArrayBuffer(8), mimeType: "audio/wav" },
  );
  const createClip = async (): Promise<ISpeechClipResult> => ({
    ok: true,
    clip: {
      duration: 1,
      play: () =>
        new Promise<void>((resolve) => {
          endings.push(resolve);
        }),
      stop: () => {
        for (const end of endings.splice(0)) end();
      },
      release: () => undefined,
    },
  });

  return {
    driver: { synthesize, createClip },
    synthesize,
    finishPlaying: () => {
      for (const end of endings.splice(0)) end();
    },
  };
}

const renders: Record<string, number> = {};
const messages: Record<string, IReadAloudMessage> = {};
const latest: { readAloud: IReadAloud | null } = { readAloud: null };

interface IReplyProps {
  id: string;
}

function Reply({ id }: IReplyProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  messages[id] = useReadAloudMessage(id, bodyRef);
  renders[id] = (renders[id] ?? 0) + 1;

  return (
    <div ref={bodyRef} data-testid={`body-${id}`}>
      Reply {id} says hello.
    </div>
  );
}

function Watcher() {
  latest.readAloud = useReadAloud();

  return null;
}

const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) {
      await Promise.resolve();
    }
  });
};

const renderApp = (children: ReactNode) => render(<>{children}</>);

afterEach(() => {
  cleanup();
  for (const key of Object.keys(renders)) delete renders[key];
  latest.readAloud = null;
});

describe("ReadAloudProvider", () => {
  it("knows which reply is being read, and leaves the others idle and unrendered", async () => {
    const fake = fakeDriver();
    renderApp(
      <ReadAloudProvider driver={fake.driver}>
        <Reply id="a" />
        <Reply id="b" />
        <Watcher />
      </ReadAloudProvider>,
    );
    const quietRenders = renders.b;

    act(() => messages.a?.speak("Reply a says hello."));
    await flush();

    expect(messages.a?.phase).toBe("playing");
    expect(messages.a?.isActive).toBe(true);
    expect(messages.b?.phase).toBe("idle");
    expect(renders.b).toBe(quietRenders);
    expect(latest.readAloud?.messageId).toBe("a");
    expect(latest.readAloud?.anchor).toBe(screen.getByTestId("body-a"));
  });

  it("plays the same reply again from the audio it already has", async () => {
    const fake = fakeDriver();
    renderApp(
      <ReadAloudProvider driver={fake.driver}>
        <Reply id="a" />
      </ReadAloudProvider>,
    );

    act(() => messages.a?.speak("Reply a says hello."));
    await flush();
    act(() => fake.finishPlaying());
    await flush();
    act(() => messages.a?.speak("Reply a says hello."));
    await flush();

    expect(messages.a?.phase).toBe("playing");
    expect(fake.synthesize).toHaveBeenCalledOnce();
  });

  it("reads a summary instead of a long reply and says so", async () => {
    const fake = fakeDriver();
    const summarize = vi.fn(async () => "A short summary.");
    renderApp(
      <ReadAloudProvider driver={fake.driver} summarize={summarize} shouldRewrite={() => true}>
        <Reply id="a" />
        <Watcher />
      </ReadAloudProvider>,
    );

    act(() => messages.a?.speak("A very long reply with a table."));
    await flush();

    expect(summarize).toHaveBeenCalledWith("a", "A very long reply with a table.", expect.any(AbortSignal));
    expect(latest.readAloud?.isSummary).toBe(true);
    expect(fake.synthesize).toHaveBeenCalledWith(expect.objectContaining({ text: "A short summary." }));
  });

  it("stops reading when asked", async () => {
    const fake = fakeDriver();
    renderApp(
      <ReadAloudProvider driver={fake.driver}>
        <Reply id="a" />
      </ReadAloudProvider>,
    );

    act(() => messages.a?.speak("Reply a says hello."));
    await flush();
    act(() => messages.a?.stop());
    await flush();

    expect(messages.a?.isActive).toBe(false);
  });

  it("refuses to start without an endpoint or a driver", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => render(<ReadAloudProvider>{null}</ReadAloudProvider>)).toThrow(/endpoint or a driver/);
  });
});

describe("ReadAloudPlayer", () => {
  it("shows the server's reason when reading fails", async () => {
    const fake = fakeDriver({ ok: false, errorCode: "TTS_FAILED", message: "No text-to-speech model selected" });
    renderApp(
      <ReadAloudProvider driver={fake.driver}>
        <Reply id="a" />
        <ReadAloudPlayer />
      </ReadAloudProvider>,
    );

    act(() => messages.a?.speak("Reply a says hello."));
    await flush();

    expect(screen.getByText("No text-to-speech model selected")).toBeTruthy();
  });
});
