import { useReadAloudMessage } from "@saystack/react-web";
import { useRef } from "react";

import type { IThreadMessage } from "./content.js";
import { Icon } from "./Icon.js";
import { Markdown } from "./Markdown.js";

interface IProps {
  message: IThreadMessage;
  onCopy: (text: string) => void;
}

const SPEAK_LABELS = { playing: "Pause", paused: "Resume", loading: "Starting…" } as const;

export function ChatMessage({ message, onCopy }: IProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const readAloud = useReadAloudMessage(message.id, bodyRef);
  const { phase } = readAloud;
  const label = phase === "playing" || phase === "paused" || phase === "loading" ? SPEAK_LABELS[phase] : "Read aloud";

  const handleSpeak = (): void => {
    if (phase === "playing") {
      readAloud.pause();
      return;
    }

    if (phase === "paused") {
      readAloud.resume();
      return;
    }

    readAloud.speak(message.text);
  };

  const handleCopy = (): void => {
    onCopy(message.text);
  };

  if (message.role === "user") {
    return (
      <article className="msg user">
        <div className="bubble">{message.text}</div>
      </article>
    );
  }

  return (
    <article className="msg bot">
      <div ref={bodyRef} className="body">
        <Markdown text={message.text} />
      </div>
      <div className="msg-actions">
        <button
          type="button"
          className="speak"
          data-phase={phase}
          aria-pressed={readAloud.isActive}
          onClick={handleSpeak}
        >
          <Icon name={phase === "playing" ? "pause" : "speaker"} size={16} />
          <span>{label}</span>
        </button>
        <button type="button" className="icon-btn" aria-label="Copy" onClick={handleCopy}>
          <Icon name="copy" size={16} />
        </button>
      </div>
    </article>
  );
}
