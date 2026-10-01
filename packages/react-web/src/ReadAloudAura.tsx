import type { TtsPhase } from "@saystack/core";
import { MESSAGE_AURA_STYLE } from "@saystack/core";
import type { AuraState } from "@saystack/web";

import type { AuraAnchor, IUseAuraOptions } from "./useAura.js";
import { useAura } from "./useAura.js";
import { useReadAloud } from "./useReadAloud.js";

interface IProps extends Omit<IUseAuraOptions, "state" | "levels"> {
  // The message being read when left out; null is the page edges.
  anchor?: AuraAnchor;
}

const PHASE_AURA: Readonly<Record<TtsPhase, AuraState>> = {
  idle: "hidden",
  loading: "working",
  playing: "active",
  paused: "paused",
  done: "hidden",
  error: "hidden",
};

export function ReadAloudAura({ anchor, style = MESSAGE_AURA_STYLE, padding = 12, ...options }: IProps) {
  const {
    speech: [state],
    anchor: message,
    readLevels,
  } = useReadAloud();

  useAura(anchor === undefined ? message : anchor, {
    ...options,
    style,
    padding,
    state: message === null ? "hidden" : PHASE_AURA[state.phase],
    levels: readLevels,
  });

  return null;
}
