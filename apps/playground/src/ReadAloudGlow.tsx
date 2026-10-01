import type { IAuraStyleOptions } from "@saystack/core";
import { ReadAloudAura } from "@saystack/react-web";
import type { RefObject } from "react";

import type { ReadAloudAnchor } from "./settings.js";

interface IProps {
  anchor: ReadAloudAnchor;
  chatRef: RefObject<Element | null>;
  playerRef: RefObject<Element | null>;
  style: IAuraStyleOptions;
}

export function ReadAloudGlow({ anchor, chatRef, playerRef, style }: IProps) {
  if (anchor === "message") {
    return <ReadAloudAura style={style} />;
  }

  if (anchor === "chat") {
    return <ReadAloudAura anchor={chatRef} style={style} padding={0} isInside />;
  }

  return (
    <ReadAloudAura
      anchor={anchor === "player" ? playerRef : null}
      style={style}
      padding={anchor === "player" ? 4 : 0}
    />
  );
}
