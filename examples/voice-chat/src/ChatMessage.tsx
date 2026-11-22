import { useReadAloudMessage } from "@saystack/react-web";
import { useRef } from "react";

import { Markdown } from "./Markdown.js";

export interface IChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

interface IProps {
  message: IChatMessage;
}

const SPEAK_LABELS = {
  idle: "Read aloud",
  loading: "Preparing…",
  playing: "Pause",
  paused: "Resume",
  done: "Read again",
  error: "Try again",
} as const;

export function ChatMessage({ message }: IProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const readAloud = useReadAloudMessage(message.id, bodyRef);
  const { phase } = readAloud;

  const handleSpeak = (): void => {
    if (phase === "loading") {
      readAloud.stop();
    } else if (phase === "playing") {
      readAloud.pause();
    } else if (phase === "paused") {
      readAloud.resume();
    } else {
      readAloud.speak(message.text);
    }
  };

  if (message.role === "user") {
    return (
      <article className="message message--user">
        <p className="bubble">{message.text}</p>
      </article>
    );
  }

  return (
    <article className="message message--assistant">
      <div ref={bodyRef} className="message__body">
        <Markdown text={message.text} />
      </div>
      <button
        type="button"
        className="speak"
        aria-pressed={readAloud.isActive}
        data-phase={phase}
        title={phase === "loading" ? "Stop" : undefined}
        onClick={handleSpeak}
      >
        {phase === "loading" && <span className="speak__spinner" aria-hidden="true" />}
        {SPEAK_LABELS[phase]}
      </button>
    </article>
  );
}
