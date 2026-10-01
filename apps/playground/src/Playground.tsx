import type { AuraBackground } from "@saystack/core";
import { ReadAloudPlayer, useDictationAura, useFieldInput, useReadAloud } from "@saystack/react-web";
import { unlockWebAudio } from "@saystack/web";
import { useEffect, useRef, useState } from "react";

import type { IThreadMessage } from "./content.js";
import { CANNED_REPLY, THREAD } from "./content.js";
import { ChatMessage } from "./ChatMessage.js";
import { Composer } from "./Composer.js";
import { hasBrowserRecognition } from "./dictation/browserRecognition.js";
import { Icon } from "./Icon.js";
import Panel from "./Panel";
import { ReadAloudGlow } from "./ReadAloudGlow.js";
import type { ISettings, Theme } from "./settings.js";
import { configSnippet, effectiveStyle, readAloudStyleOptions } from "./settings.js";
import { usePlaygroundDictation } from "./usePlaygroundDictation.js";

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
  const input = useFieldInput(fieldRef, setDraft);
  const dictationStyle = effectiveStyle("dictation", settings.dictation, background);
  const dictation = usePlaygroundDictation(settings.source, dictationStyle.bands, input);
  const readAloud = useReadAloud();
  const [speech, speechApi] = readAloud.speech;
  const isRecording = dictation.state === "recording";
  const isReading = speech.phase === "loading" || speech.phase === "playing" || speech.phase === "paused";
  const dictationAnchor = { composer: formRef, mic: micRef, page: null }[settings.dictationAnchor];

  useDictationAura(dictationAnchor, dictation, {
    style: settings.dictation,
    padding: settings.dictationAnchor === "mic" ? 2 : 0,
  });

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
      <main className="chat">
        <header className="chat-head">
          <div className="brand">
            <span className="wordmark">saystack</span>
            <span className="brand-sub">Playground</span>
          </div>
          <div className="head-actions">
            <a className="text-link" href="./mobile.html">
              Mobile
            </a>
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

        <div ref={chatRef} className="scroll">
          <div className="thread">
            <p className="thread-note">
              Try saystack&apos;s voice UI. The replies and the voice are pre-recorded, so nothing leaves the page
              unless you use the microphone. Press the mic to dictate, or Read aloud under a reply.
            </p>
            {[...THREAD, ...sent].map((message) => (
              <ChatMessage key={message.id} message={message} onCopy={handleCopyMessage} />
            ))}
          </div>
        </div>

        <div className="dock">
          <div ref={playerRef}>
            <ReadAloudPlayer style={effectiveStyle("readAloud", settings.readAloud, background)} />
          </div>
          <Composer
            dictation={dictation}
            draft={draft}
            formRef={formRef}
            fieldRef={fieldRef}
            micRef={micRef}
            onDraft={setDraft}
            onSend={handleSend}
          />
          <p className="dock-note">
            <span>Voice: {settings.source === "demo" ? "demo clip" : "microphone"}</span>
            <span>
              <kbd>M</kbd> dictate
            </span>
            <span>
              <kbd>Space</kbd> pause
            </span>
            <span>
              <kbd>Esc</kbd> stop
            </span>
          </p>
        </div>
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

      <ReadAloudGlow
        anchor={settings.readAloudAnchor}
        chatRef={chatRef}
        playerRef={playerRef}
        style={readAloudStyleOptions(settings.readAloud)}
      />
    </div>
  );
}
