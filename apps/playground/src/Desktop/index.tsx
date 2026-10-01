import type { AuraBackground } from "@saystack/core";
import type { IWebDictation } from "@saystack/react-web";
import { ReadAloudPlayer, useDictationAura } from "@saystack/react-web";
import type { RefObject } from "react";

import { ChatMessage } from "../ChatMessage.js";
import { Composer } from "../Composer.js";
import type { IThreadMessage } from "../content.js";
import { ReadAloudGlow } from "../ReadAloudGlow.js";
import type { ISettings } from "../settings.js";
import { effectiveStyle, readAloudStyleOptions } from "../settings.js";

interface IProps {
  settings: ISettings;
  background: AuraBackground;
  messages: readonly IThreadMessage[];
  dictation: IWebDictation;
  draft: string;
  chatRef: RefObject<HTMLDivElement | null>;
  formRef: RefObject<HTMLFormElement | null>;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  micRef: RefObject<HTMLButtonElement | null>;
  playerRef: RefObject<HTMLDivElement | null>;
  onDraft: (value: string) => void;
  onSend: (text: string) => void;
  onCopyMessage: (text: string) => void;
}

export default function Desktop({
  settings,
  background,
  messages,
  dictation,
  draft,
  chatRef,
  formRef,
  fieldRef,
  micRef,
  playerRef,
  onDraft,
  onSend,
  onCopyMessage,
}: IProps) {
  const dictationAnchor = { composer: formRef, mic: micRef, page: null }[settings.dictationAnchor];

  useDictationAura(dictationAnchor, dictation, {
    style: settings.dictation,
    padding: settings.dictationAnchor === "mic" ? 2 : 0,
  });

  return (
    <>
      <div ref={chatRef} className="scroll">
        <div className="thread">
          <p className="thread-note">
            Try saystack&apos;s voice UI. The replies and the voice are pre-recorded, so nothing leaves the page unless
            you use the microphone. Press the mic to dictate, or Read aloud under a reply.
          </p>
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} onCopy={onCopyMessage} />
          ))}
        </div>
      </div>

      <div className="dock">
        <div ref={playerRef}>
          <ReadAloudPlayer style={effectiveStyle("readAloud", settings.readAloud, background, "desktop")} />
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

      <ReadAloudGlow
        anchor={settings.readAloudAnchor}
        chatRef={chatRef}
        playerRef={playerRef}
        style={readAloudStyleOptions(settings.readAloud)}
      />
    </>
  );
}
