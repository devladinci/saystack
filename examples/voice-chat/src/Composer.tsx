import { useDictationAura, useFieldInput, useWebDictation } from "@saystack/react-web";
import { unlockWebAudio } from "@saystack/web";
import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";
import { useRef, useState } from "react";

interface IProps {
  isWaiting: boolean;
  onSend: (text: string) => void;
}

const DICTATION_ERRORS: Readonly<Record<string, string>> = {
  MIC_PERMISSION_DENIED: "The microphone is blocked for this page.",
  MIC_UNAVAILABLE: "No microphone is available.",
  RECORDING_TOO_SHORT: "That was too short to transcribe.",
  ENGINE_UNAVAILABLE: "The transcription engine can't be reached.",
};

const realtimeUrl = (): string =>
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/voice/audio/transcriptions/realtime`;

export function Composer({ isWaiting, onSend }: IProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const input = useFieldInput(fieldRef, setDraft);
  const dictation = useWebDictation({
    endpoint: "/voice/audio/transcriptions",
    realtime: { url: realtimeUrl },
    input,
  });
  const isRecording = dictation.state === "recording";
  const isTranscribing = dictation.state === "transcribing";

  useDictationAura(formRef, dictation);

  const send = (): void => {
    const text = draft.trim();

    if (text === "" || isWaiting) {
      return;
    }

    onSend(text);
    setDraft("");
  };

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    send();
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    setDraft(event.target.value);
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

  const error =
    dictation.state === "error"
      ? ((dictation.errorCode === undefined ? undefined : DICTATION_ERRORS[dictation.errorCode]) ?? dictation.errorMessage)
      : undefined;

  return (
    <form ref={formRef} className="composer" onSubmit={handleSubmit}>
      <textarea
        ref={fieldRef}
        className="composer__field"
        rows={2}
        value={draft}
        placeholder={isRecording ? "Listening…" : isTranscribing ? "Transcribing…" : "Message"}
        aria-label="Message"
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
      <button
        type="button"
        className="composer__mic"
        aria-pressed={isRecording}
        aria-label={isRecording ? "Stop dictation" : "Dictate"}
        disabled={!dictation.isSupported || isTranscribing}
        onClick={handleMic}
      >
        {isRecording ? "Stop" : "Mic"}
      </button>
      <button type="submit" className="composer__send" disabled={isWaiting || draft.trim() === ""}>
        Send
      </button>
      {error !== undefined && <p className="composer__error">{error}</p>}
    </form>
  );
}
