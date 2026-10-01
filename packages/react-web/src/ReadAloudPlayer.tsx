import type { IAuraStyle } from "@saystack/core";
import type { IPlayerLabels } from "@saystack/react";

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

  const handleLocate = (): void => {
    anchor?.scrollIntoView({ block: "center", behavior: "smooth" });
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
