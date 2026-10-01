import type { AuraBackground, AuraState, TtsPhase } from "@saystack/core";
import type { IWebDictation } from "@saystack/react-web";
import { ReadAloudPlayer, useReadAloud } from "@saystack/react-web";
import type { RefObject } from "react";
import { useEffect } from "react";

import { ChatMessage } from "../ChatMessage.js";
import { Composer } from "../Composer.js";
import type { IThreadMessage } from "../content.js";
import { Icon } from "../Icon.js";
import type { ISettings } from "../settings.js";
import { effectiveStyle } from "../settings.js";
import { Captions } from "./Captions.js";
import { TopWave } from "./TopWave.js";

interface IProps {
  settings: ISettings;
  background: AuraBackground;
  messages: readonly IThreadMessage[];
  dictation: IWebDictation;
  draft: string;
  caption: string;
  isDropping: boolean;
  chatRef: RefObject<HTMLDivElement | null>;
  formRef: RefObject<HTMLFormElement | null>;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  micRef: RefObject<HTMLButtonElement | null>;
  onDraft: (value: string) => void;
  onSend: (text: string) => void;
  onCopyMessage: (text: string) => void;
}

const DICTATION_AURA: Readonly<Record<IWebDictation["state"], AuraState>> = {
  idle: "hidden",
  recording: "active",
  transcribing: "working",
  done: "hidden",
  error: "hidden",
};

const READING_AURA: Readonly<Record<TtsPhase, AuraState>> = {
  idle: "hidden",
  loading: "working",
  playing: "active",
  paused: "paused",
  done: "hidden",
  error: "hidden",
};

// Room for the bands above the reply that lifts while it is read.
const READING_TOP = 96;

// The phone counterpart of the chat: @saystack/react-native's dictation and read-aloud spotlights, drawn with the
// web packages so they run here.
export default function Mobile({
  settings,
  background,
  messages,
  dictation,
  draft,
  caption,
  isDropping,
  chatRef,
  formRef,
  fieldRef,
  micRef,
  onDraft,
  onSend,
  onCopyMessage,
}: IProps) {
  const { speech, anchor, readLevels } = useReadAloud();
  const [{ phase }] = speech;
  const isListening = dictation.state === "recording";
  const isDictating = isListening || dictation.state === "transcribing" || caption !== "" || isDropping;
  const isReading = phase === "loading" || phase === "playing" || phase === "paused";
  const spotlight = isDictating ? "dictating" : isReading ? "reading" : "none";

  useEffect(() => {
    const list = chatRef.current;
    const message = anchor?.closest("article");

    if (!isReading || list === null || !(message instanceof HTMLElement)) {
      return;
    }

    list.scrollTo({ top: message.offsetTop - READING_TOP, behavior: "smooth" });
  }, [isReading, anchor, chatRef]);

  return (
    <div className="stage">
      <div className="device">
        <div className="screen" data-spotlight={spotlight}>
          <header className="m-nav">
            <span className="m-back" aria-hidden="true">
              <Icon name="back" size={18} />
            </span>
            <span className="m-title">Voice chat</span>
          </header>

          <div className="m-body">
            <div ref={chatRef} className="m-list">
              <div className="thread">
                {messages.map((message) => (
                  <ChatMessage key={message.id} message={message} onCopy={onCopyMessage} />
                ))}
              </div>
            </div>
            {isDictating ? <Captions text={caption} isListening={isListening} isDropping={isDropping} /> : null}
          </div>

          <div className="m-dock">
            <div className="m-player">
              <ReadAloudPlayer style={effectiveStyle("readAloud", settings.readAloud, background, "mobile")} />
            </div>
            <Composer
              dictation={dictation}
              draft={draft}
              formRef={formRef}
              fieldRef={fieldRef}
              micRef={micRef}
              onDraft={onDraft}
              onSend={onSend}
            />
          </div>

          <div className="m-backdrop" aria-hidden="true" />
          <TopWave state={DICTATION_AURA[dictation.state]} levels={dictation.readLevels} style={settings.dictation} />
          <TopWave state={READING_AURA[phase]} levels={readLevels} style={settings.readAloud} />
        </div>
        <div className="bezel" aria-hidden="true" />
        <div className="island" aria-hidden="true" />
      </div>
    </div>
  );
}
