import type { IWebDictation } from "@saystack/react-web";
import { unlockWebAudio } from "@saystack/web";
import type { ChangeEvent, FormEvent, KeyboardEvent, RefObject } from "react";
import { useLayoutEffect } from "react";

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

  // The field is as tall as its text, up to the limit its stylesheet sets, and grows there instead of jumping.
  useLayoutEffect(() => {
    const field = fieldRef.current;

    if (field === null) {
      return;
    }

    const from = field.offsetHeight;

    field.style.transition = "none";
    field.style.height = "auto";

    const limit = Number.parseFloat(getComputedStyle(field).maxHeight);
    const full = field.scrollHeight;
    const to = Number.isNaN(limit) ? full : Math.min(full, limit);

    // Text that fits shows from its first line while the field grows; only past the limit does it scroll.
    field.style.overflowY = to < full ? "auto" : "hidden";
    field.style.height = `${from}px`;
    // Reading the height back makes it the starting point before the transition is switched on again.
    void field.offsetHeight;
    field.style.transition = "";
    field.style.height = `${to}px`;

    if (to >= full) {
      field.scrollTop = 0;
    }
  }, [draft, fieldRef]);

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
