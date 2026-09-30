import type { TtsPhase } from "@saystack/core";
import { MESSAGE_AURA_STYLE } from "@saystack/core";
import type { AuraState } from "@saystack/web";

import type { IUseAuraOptions } from "./useAura.js";
import { useAura } from "./useAura.js";
import { useReadAloud } from "./useReadAloud.js";

type IProps = Omit<IUseAuraOptions, "state" | "levels">;

const PHASE_AURA: Readonly<Record<TtsPhase, AuraState>> = {
  idle: "hidden",
  loading: "working",
  playing: "active",
  paused: "paused",
  done: "hidden",
  error: "hidden",
};

export function ReadAloudAura({ style = MESSAGE_AURA_STYLE, padding = 12, ...options }: IProps) {
  const {
    speech: [state],
    anchor,
    readLevels,
  } = useReadAloud();

  useAura(anchor, {
    ...options,
    style,
    padding,
    state: anchor === null ? "hidden" : PHASE_AURA[state.phase],
    levels: readLevels,
  });

  return null;
}
