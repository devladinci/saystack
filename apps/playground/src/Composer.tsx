import type { IWebDictation } from "@saystack/react-web";
import { unlockWebAudio } from "@saystack/web";
import type { ChangeEvent, FormEvent, KeyboardEvent, RefObject } from "react";

import { Icon } from "./Icon.js";
import { useElapsed } from "./useElapsed.js";

interface IProps {
  dictation: IWebDictation;
  draft: string;
  formRef: RefObject<HTMLFormElement | null>;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  micRef: RefObject<HTMLButtonElement | null>;
  onDraft: (value: string) => void;
  onSend: (text: string) => void;
}

const clock = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export function Composer({ dictation, draft, formRef, fieldRef, micRef, onDraft, onSend }: IProps) {
  const isRecording = dictation.state === "recording";
  const elapsed = useElapsed(isRecording);

  const send = (): void => {
    const text = draft.trim();

    if (text === "") {
      return;
    }

    onSend(text);
  };

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    send();
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    onDraft(event.target.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };

  const handleMic = (): void => {
    if (isRecording) {
      dictation.handlePressEnd();
      return;
    }

    unlockWebAudio();
    dictation.handlePressStart();
  };

  return (
    <form ref={formRef} className="composer" data-voice={dictation.state} onSubmit={handleSubmit}>
      <div className="field">
        <textarea
          ref={fieldRef}
          rows={1}
          value={draft}
          placeholder="Message"
          aria-label="Message"
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
      </div>
      {isRecording ? <span className="mic-timer">{clock(elapsed)}</span> : null}
      <button
        ref={micRef}
        type="button"
        className="mic"
        aria-pressed={isRecording}
        aria-label={isRecording ? "Stop dictating" : "Dictate"}
        disabled={dictation.state === "transcribing"}
        onClick={handleMic}
      >
        <Icon name={isRecording ? "stop" : "mic"} />
      </button>
      <button type="submit" className="send" aria-label="Send">
        <Icon name="send" />
      </button>
    </form>
  );
}
