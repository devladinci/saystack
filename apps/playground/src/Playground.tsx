import type { AuraBackground } from "@saystack/core";
import { useFieldInput, useReadAloud } from "@saystack/react-web";
import { unlockWebAudio } from "@saystack/web";
import { useEffect, useRef, useState } from "react";

import type { IThreadMessage } from "./content.js";
import { CANNED_REPLY, THREAD } from "./content.js";
import Desktop from "./Desktop";
import { hasBrowserRecognition } from "./dictation/browserRecognition.js";
import { Icon } from "./Icon.js";
import Mobile from "./Mobile";
import { createCaptionInput } from "./Mobile/captionInput.js";
import Panel from "./Panel";
import type { ISettings, Theme, View } from "./settings.js";
import { configSnippet, effectiveStyle } from "./settings.js";
import { usePlaygroundDictation } from "./usePlaygroundDictation.js";
import { ViewSwitch } from "./ViewSwitch.js";

interface IProps {
  settings: ISettings;
  background: AuraBackground;
  onChange: (next: Partial<ISettings>) => void;
  onReset: () => void;
}

const THEMES: readonly Theme[] = ["system", "light", "dark"];
const THEME_ICONS = { system: "system", light: "sun", dark: "moon" } as const;
const TOAST_MS = 2600;
const REPO_URL = "https://github.com/devladinci/saystack";

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export function Playground({ settings, background, onChange, onReset }: IProps) {
  const chatRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const micRef = useRef<HTMLButtonElement | null>(null);
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<IThreadMessage[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [hasRecognition] = useState(hasBrowserRecognition);
  const [caption, setCaption] = useState("");
  const [isDropping, setIsDropping] = useState(false);
  const fieldInput = useFieldInput(fieldRef, setDraft);
  const [captionInput] = useState(() =>
    createCaptionInput(fieldInput, {
      onCaption: (text) => {
        setCaption(text);
        setIsDropping(false);
      },
      onDrop: () => setIsDropping(true),
    }),
  );
  const isMobile = settings.view === "mobile";
  const dictationStyle = effectiveStyle("dictation", settings.dictation, background, settings.view);
  const dictation = usePlaygroundDictation(settings.source, dictationStyle.bands, isMobile ? captionInput : fieldInput);
  const readAloud = useReadAloud();
  const [speech, speechApi] = readAloud.speech;
  const isRecording = dictation.state === "recording";
  const isReading = speech.phase === "loading" || speech.phase === "playing" || speech.phase === "paused";
  const messages = [...THREAD, ...sent];

  const notify = (message: string): void => {
    setToast(message);
  };

  useEffect(() => {
    if (toast === null) {
      return;
    }

    const timer = setTimeout(() => setToast(null), TOAST_MS);

    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (dictation.state === "error" && dictation.errorMessage !== undefined) {
      setToast(dictation.errorMessage);
    }
  }, [dictation.state, dictation.errorMessage]);

  const copy = (text: string, done: string): void => {
    void navigator.clipboard.writeText(text).then(
      () => notify(done),
      () => notify("The browser did not allow copying."),
    );
  };

  const handleCopyMessage = (text: string): void => {
    copy(text, "Copied the reply.");
  };

  const handleCopyCode = (): void => {
    copy(configSnippet(settings), "Copied the code.");
  };

  const handleCopyLink = (): void => {
    copy(window.location.href, "Copied a link to these settings.");
  };

  const handleSend = (text: string): void => {
    const at = Date.now();
    setSent((current) => [
      ...current,
      { id: `sent-${at}`, role: "user", text },
      { id: `reply-${at}`, role: "assistant", text: CANNED_REPLY },
    ]);
    setDraft("");
    requestAnimationFrame(() => chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" }));
  };

  const handleTheme = (): void => {
    const next = THEMES[(THEMES.indexOf(settings.theme) + 1) % THEMES.length] ?? "system";
    onChange({ theme: next });
  };

  const handleView = (view: View): void => {
    onChange({ view });
  };

  const handleTogglePanel = (): void => {
    setIsPanelOpen((isOpen) => !isOpen);
  };

  const handleClosePanel = (): void => {
    setIsPanelOpen(false);
  };

  const keysRef = useRef({ dictation, speechApi, speech, isRecording, isReading });

  useEffect(() => {
    keysRef.current = { dictation, speechApi, speech, isRecording, isReading };
  });

  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      const current = keysRef.current;

      if (event.key === "Escape") {
        if (current.isRecording) {
          current.dictation.handleCancel();
        } else if (current.isReading) {
          current.speechApi.stop();
        }
        return;
      }

      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === "m" || event.key === "M") {
        event.preventDefault();

        if (current.isRecording) {
          current.dictation.handlePressEnd();
          return;
        }

        unlockWebAudio();
        current.dictation.handlePressStart();
        return;
      }

      if (event.key === " " && current.isReading) {
        event.preventDefault();

        if (current.speech.phase === "paused") {
          current.speechApi.resume();
          return;
        }

        current.speechApi.pause();
      }
    };

    window.addEventListener("keydown", handleKey);

    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const status = isRecording ? "Dictation" : isReading ? "Reading aloud" : "Idle";
  const readLevels = isRecording ? dictation.readLevels : readAloud.readLevels;

  return (
    <div className="app">
      <main className="chat" data-view={settings.view}>
        <header className="chat-head">
          <div className="brand">
            <img className="brand-mark" src="./favicon.svg" alt="" width={22} height={22} />
            <span className="wordmark">saystack</span>
            <span className="brand-sub">Playground</span>
          </div>
          <ViewSwitch view={settings.view} onChange={handleView} />
          <div className="head-actions">
            <a className="text-link" href={REPO_URL}>
              GitHub
            </a>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Theme: ${settings.theme}. Switch theme`}
              title={`Theme: ${settings.theme}`}
              onClick={handleTheme}
            >
              <Icon name={THEME_ICONS[settings.theme]} />
            </button>
            <button
              type="button"
              className="icon-btn tune"
              aria-label="Tune the voice UI"
              aria-expanded={isPanelOpen}
              aria-controls="panel"
              onClick={handleTogglePanel}
            >
              <Icon name="tune" />
            </button>
          </div>
        </header>

        {toast === null ? null : (
          <div className="toast" role="status">
            {toast}
          </div>
        )}

        {isMobile ? (
          <Mobile
            settings={settings}
            background={background}
            messages={messages}
            dictation={dictation}
            draft={draft}
            caption={caption}
            isDropping={isDropping}
            chatRef={chatRef}
            formRef={formRef}
            fieldRef={fieldRef}
            micRef={micRef}
            onDraft={setDraft}
            onSend={handleSend}
            onCopyMessage={handleCopyMessage}
          />
        ) : (
          <Desktop
            settings={settings}
            background={background}
            messages={messages}
            dictation={dictation}
            draft={draft}
            chatRef={chatRef}
            formRef={formRef}
            fieldRef={fieldRef}
            micRef={micRef}
            playerRef={playerRef}
            onDraft={setDraft}
            onSend={handleSend}
            onCopyMessage={handleCopyMessage}
          />
        )}
      </main>

      <Panel
        settings={settings}
        background={background}
        snippet={configSnippet(settings)}
        status={status}
        liveTarget={isRecording ? "dictation" : isReading ? "readAloud" : null}
        isOpen={isPanelOpen}
        hasRecognition={hasRecognition}
        readLevels={readLevels}
        onChange={onChange}
        onReset={onReset}
        onCopyCode={handleCopyCode}
        onCopyLink={handleCopyLink}
      />
      {isPanelOpen ? <div className="scrim" aria-hidden="true" onClick={handleClosePanel} /> : null}
    </div>
  );
}
