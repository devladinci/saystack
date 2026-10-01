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

export function ChatMessage({ message }: IProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const readAloud = useReadAloudMessage(message.id, bodyRef);

  const handleSpeak = (): void => {
    if (readAloud.phase === "playing") {
      readAloud.pause();
    } else if (readAloud.phase === "paused") {
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
      <button type="button" className="speak" aria-pressed={readAloud.isActive} onClick={handleSpeak}>
        {readAloud.phase === "playing" ? "Pause" : readAloud.phase === "paused" ? "Resume" : "Read aloud"}
      </button>
    </article>
  );
}
