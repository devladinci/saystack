import type { AuraBackground, IAuraStyle } from "@saystack/core";
import { useState } from "react";

import type { AuraTarget, DictationAnchor, DictationSource, ISettings, ReadAloudAnchor } from "../settings.js";
import { effectiveStyle } from "../settings.js";
import { AuraControls } from "./AuraControls.js";
import { LiveBands } from "./LiveBands.js";
import { Segment } from "./Segment.js";
import { Select } from "./Select.js";
import { ShareControls } from "./ShareControls.js";
import { Toggle } from "./Toggle.js";

interface IProps {
  settings: ISettings;
  background: AuraBackground;
  snippet: string;
  status: string;
  liveTarget: AuraTarget | null;
  isOpen: boolean;
  hasRecognition: boolean;
  readLevels: () => ArrayLike<number> | undefined;
  onChange: (next: Partial<ISettings>) => void;
  onReset: () => void;
  onCopyCode: () => void;
  onCopyLink: () => void;
}

const SOURCES = [
  { value: "demo", label: "Demo clip" },
  { value: "mic", label: "Microphone" },
] as const;

const DICTATION_ANCHORS = [
  { value: "composer", label: "Input" },
  { value: "mic", label: "Mic button" },
  { value: "page", label: "No anchor" },
] as const;

const READ_ALOUD_ANCHORS = [
  { value: "message", label: "The message being read" },
  { value: "chat", label: "The whole chat" },
  { value: "player", label: "The player" },
  { value: "page", label: "No anchor (page edges)" },
] as const;

export default function Panel({
  settings,
  background,
  snippet,
  status,
  liveTarget,
  isOpen,
  hasRecognition,
  readLevels,
  onChange,
  onReset,
  onCopyCode,
  onCopyLink,
}: IProps) {
  const [target, setTarget] = useState<AuraTarget>("dictation");
  const style = effectiveStyle(target, settings[target], background);
  const meterTarget = liveTarget ?? target;
  const meterStyle = effectiveStyle(meterTarget, settings[meterTarget], background);

  const handleStyle = (next: Partial<IAuraStyle>): void => {
    onChange({ [target]: { ...settings[target], ...next } });
  };

  const handleSource = (source: DictationSource): void => {
    onChange({ source });
  };

  const handleDictationAnchor = (dictationAnchor: DictationAnchor): void => {
    onChange({ dictationAnchor });
  };

  const handleReadAloudAnchor = (readAloudAnchor: ReadAloudAnchor): void => {
    onChange({ readAloudAnchor });
  };

  const handleLatency = (hasLatency: boolean): void => {
    onChange({ hasLatency });
  };

  return (
    <aside id="panel" className="panel" data-open={isOpen} aria-label="Tune the voice UI">
      <div className="panel-head">
        <h2 className="panel-title">Tune</h2>
        <button type="button" className="text-btn" onClick={onReset}>
          Reset
        </button>
      </div>
      <div className="panel-scroll">
        <LiveBands bands={meterStyle.bands} palette={meterStyle.palette} status={status} readLevels={readLevels} />
        <AuraControls target={target} style={style} onTarget={setTarget} onChange={handleStyle} />
        <section className="p-section">
          <h2 className="p-title">Dictation</h2>
          <Segment label="Voice" value={settings.source} options={SOURCES} onChange={handleSource} />
          <Segment
            label="Anchor"
            value={settings.dictationAnchor}
            options={DICTATION_ANCHORS}
            onChange={handleDictationAnchor}
          />
          <p className="p-note">
            {hasRecognition
              ? "With the microphone, the words come from your browser's own speech recognition, which may send the audio to its maker's servers. The demo clip stays in the page."
              : "This browser has no speech recognition, so with the microphone only the aura follows your voice. The demo clip streams its words."}
          </p>
        </section>
        <section className="p-section">
          <h2 className="p-title">Read aloud</h2>
          <Select
            label="Anchor"
            value={settings.readAloudAnchor}
            options={READ_ALOUD_ANCHORS}
            onChange={handleReadAloudAnchor}
          />
          <Toggle
            label="Wait 1.2 s for the first audio, like an engine"
            isOn={settings.hasLatency}
            onChange={handleLatency}
          />
        </section>
        <ShareControls snippet={snippet} onCopyCode={onCopyCode} onCopyLink={onCopyLink} />
        <section className="p-section">
          <h2 className="p-title">Keys</h2>
          <dl className="keys">
            <dt>
              <kbd>M</kbd>
            </dt>
            <dd>Start or stop dictation</dd>
            <dt>
              <kbd>Space</kbd>
            </dt>
            <dd>Pause or resume reading</dd>
            <dt>
              <kbd>Esc</kbd>
            </dt>
            <dd>Cancel dictation or stop reading</dd>
          </dl>
          <p className="p-note">While a reply is read, click any word to jump there.</p>
        </section>
      </div>
    </aside>
  );
}
