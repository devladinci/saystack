import type { ISpeechClipResult, ITtsDriver } from "@saystack/core";
import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const auras = vi.hoisted(() => ({ anchors: [] as (Element | null)[], states: [] as string[] }));

vi.mock("@saystack/web", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createAura: () => ({
    canvas: null,
    state: "hidden",
    setState: (state: string) => auras.states.push(state),
    setAnchor: (anchor: Element | null) => auras.anchors.push(anchor),
    update: () => undefined,
    destroy: () => undefined,
  }),
}));

const { ReadAloudAura } = await import("../src/ReadAloudAura.js");
const { ReadAloudProvider } = await import("../src/ReadAloudProvider.js");
const { useReadAloudMessage } = await import("../src/useReadAloudMessage.js");

const driver: ITtsDriver = {
  synthesize: async () => ({ ok: true, audio: new ArrayBuffer(8), mimeType: "audio/wav" }),
  createClip: async (): Promise<ISpeechClipResult> => ({
    ok: true,
    clip: {
      duration: 1,
      play: () => new Promise<void>(() => undefined),
      stop: () => undefined,
      release: () => undefined,
    },
  }),
};

const speakers: { speak: (markdown: string) => void } = { speak: () => undefined };

interface IReplyProps {
  isChatAnchor: boolean;
}

function Chat({ isChatAnchor }: IReplyProps) {
  const chatRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  speakers.speak = useReadAloudMessage("a", bodyRef).speak;

  return (
    <div ref={chatRef} data-testid="chat">
      <div ref={bodyRef} data-testid="body">
        Hello there.
      </div>
      {isChatAnchor ? <ReadAloudAura anchor={chatRef} /> : <ReadAloudAura />}
    </div>
  );
}

const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) {
      await Promise.resolve();
    }
  });
};

afterEach(() => {
  cleanup();
  auras.anchors = [];
  auras.states = [];
});

describe("ReadAloudAura", () => {
  it("gathers around the message being read", async () => {
    const view = render(
      <ReadAloudProvider driver={driver}>
        <Chat isChatAnchor={false} />
      </ReadAloudProvider>,
    );

    act(() => speakers.speak("Hello there."));
    await flush();

    expect(auras.anchors.at(-1)).toBe(view.getByTestId("body"));
    expect(auras.states.at(-1)).toBe("active");
  });

  it("gathers around the anchor the app picks instead", async () => {
    const view = render(
      <ReadAloudProvider driver={driver}>
        <Chat isChatAnchor />
      </ReadAloudProvider>,
    );

    act(() => speakers.speak("Hello there."));
    await flush();

    expect(auras.anchors.at(-1)).toBe(view.getByTestId("chat"));
    expect(auras.states.at(-1)).toBe("active");
  });
});
