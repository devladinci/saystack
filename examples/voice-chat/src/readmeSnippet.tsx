// The read-aloud snippet from the root README, compiled so it cannot drift from the real API.
// It is never rendered; `pnpm typecheck` is the check.
import type { IStyleMap } from "@saystack/core";
import { ReadAloudPlayer, ReadAloudProvider, useReadAloudMessage } from "@saystack/react-web";
import type { ReadAloudId } from "@saystack/react-web";
import type { ReactNode } from "react";
import { useRef } from "react";

declare function Markdown(props: { source: string }): ReactNode;
declare const token: string;
declare function summarize(id: ReadAloudId, markdown: string, signal: AbortSignal): Promise<string | null>;

export function Reply({ id, markdown }: { id: string; markdown: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { phase, speak, stop } = useReadAloudMessage(id, ref);
  const isSpeaking = phase === "playing" || phase === "paused";

  const handleClick = (): void => {
    if (isSpeaking) {
      stop();
      return;
    }

    speak(markdown);
  };

  return (
    <div ref={ref}>
      <button onClick={handleClick}>{isSpeaking ? "Stop" : "Read"}</button>
      <Markdown source={markdown} />
    </div>
  );
}

// Your vocabulary, and the one channel a style may travel on: a body field here.
const styleMap: IStyleMap = {
  channel: { mode: "field", field: "instructions" },
  rules: [{ value: "amused" }, { value: "enthusiastic", label: "excited" }],
};

export function App({ children }: { children: ReactNode }) {
  return (
    <ReadAloudProvider
      endpoint="/api/tts"
      headers={() => ({ authorization: token })}
      summarize={summarize}
      styleMap={styleMap}
    >
      {children}
      <ReadAloudPlayer />
    </ReadAloudProvider>
  );
}
