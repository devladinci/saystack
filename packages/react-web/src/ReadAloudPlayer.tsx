import type { IAuraStyle } from "@saystack/core";
import type { IPlayerLabels } from "@saystack/react";
import { LOCATE_EVENT } from "@saystack/web";

import SpeechPlayer from "./SpeechPlayer/index.js";
import { useReadAloud } from "./useReadAloud.js";

interface IProps {
  style?: Partial<IAuraStyle>;
  labels?: Partial<IPlayerLabels>;
  autoHideMs?: number;
  onClose?: () => void;
  className?: string;
}

export function ReadAloudPlayer({ style, labels, autoHideMs, onClose, className }: IProps) {
  const { speech, anchor, readLevels } = useReadAloud();

  // The read-along knows which word is being read and brings that into view; with no words marked, the
  // message itself is the best there is to show.
  const handleLocate = (): void => {
    const isAnswered = anchor?.dispatchEvent(new CustomEvent(LOCATE_EVENT, { cancelable: true })) === false;

    if (!isAnswered) {
      anchor?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  };

  return (
    <SpeechPlayer
      speech={speech}
      levels={readLevels}
      style={style}
      labels={labels}
      autoHideMs={autoHideMs}
      onLocate={anchor === null ? undefined : handleLocate}
      onClose={onClose}
      className={className}
    />
  );
}
