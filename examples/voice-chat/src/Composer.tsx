import { useDictationAura, useFieldInput, useWebDictation } from "@saystack/react-web";
import { unlockWebAudio } from "@saystack/web";
import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface IProps {
  isWaiting: boolean;
  // What the chat has been about, so the server can tell a misheard "peer" from the "PR" under discussion.
  context: string;
  onSend: (text: string) => void;
}

// What the person at the keyboard can act on. An engine's own error text goes to the console, not the page.
const DICTATION_ERRORS: Readonly<Record<string, string>> = {
  MIC_PERMISSION_DENIED: "The microphone is blocked for this page.",
  MIC_UNAVAILABLE: "No microphone is available.",
  RECORDING_UNSUPPORTED: "This browser can't record audio.",
  RECORDING_TOO_SHORT: "That was too short to transcribe.",
  EMPTY_AUDIO: "Nothing was recorded.",
  AUDIO_TOO_LARGE: "That recording is too long to transcribe.",
  ENGINE_UNAVAILABLE: "The transcription engine can't be reached.",
  TIMEOUT: "Transcription took too long. Try again.",
};

const DICTATION_FAILED = "Dictation didn't work this time. Try again.";

const realtimeUrl = (): string =>
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/voice/audio/transcriptions/realtime`;

export function Composer({ isWaiting, context, onSend }: IProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [isErrorDismissed, setErrorDismissed] = useState(false);
  const input = useFieldInput(fieldRef, setDraft);
  const dictation = useWebDictation({
    endpoint: "/voice/audio/transcriptions",
    // Long enough for the server to clean a long dictation up on a local model.
    realtime: { url: realtimeUrl, finishTimeoutMs: 15_000 },
    context,
    input,
  });
  const { state, errorCode, errorMessage } = dictation;
  const isRecording = state === "recording";
  const isTranscribing = state === "transcribing";
  const isDictating = isRecording || isTranscribing;

  useDictationAura(formRef, dictation);

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
  }, [draft]);

  useEffect(() => {
    if (state === "error") {
      console.warn(`dictation failed: ${errorCode ?? "unknown"}`, errorMessage ?? "");
    }

    if (state === "done") {
      const field = fieldRef.current;
      field?.focus();
      field?.setSelectionRange(field.value.length, field.value.length);
    }
  }, [state, errorCode, errorMessage]);

  const send = (): void => {
    const text = draft.trim();

    if (text === "" || isWaiting || isDictating) {
      return;
    }

    onSend(text);
    setDraft("");
  };

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    send();
  };

  // Typing moves on from a dictation that failed, so its message goes.
  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    setDraft(event.target.value);
    setErrorDismissed(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === "Escape" && isDictating) {
      event.preventDefault();
      dictation.handleCancel();
      return;
    }

    const isInField = event.target === fieldRef.current;

    if (event.key === "Enter" && isInField && !event.shiftKey && !event.nativeEvent.isComposing) {
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
    setErrorDismissed(false);
    dictation.handlePressStart();
  };

  const known = errorCode === undefined ? undefined : DICTATION_ERRORS[errorCode];
  const error = state === "error" && !isErrorDismissed ? (known ?? DICTATION_FAILED) : null;

  return (
    <form
      ref={formRef}
      className="composer"
      data-dictation={isDictating ? state : undefined}
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
    >
      <textarea
        ref={fieldRef}
        className="composer__field"
        rows={1}
        value={draft}
        placeholder={isRecording ? "Listening…" : isTranscribing ? "Transcribing…" : "Message"}
        aria-label="Message"
        onChange={handleChange}
      />
      <button
        type="button"
        className="composer__mic"
        aria-pressed={isRecording}
        aria-label={isRecording ? "Stop dictation" : "Dictate"}
        disabled={!dictation.isSupported || isTranscribing}
        onClick={handleMic}
      >
        <span className="composer__dot" aria-hidden="true" />
        {isRecording ? "Stop" : "Mic"}
      </button>
      <button type="submit" className="composer__send" disabled={isWaiting || isDictating || draft.trim() === ""}>
        Send
      </button>
      {error !== null && (
        <p className="composer__error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
