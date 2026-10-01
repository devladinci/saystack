import type { DictationState } from "@saystack/react";
import type { AuraState } from "@saystack/web";

import type { AuraAnchor, IUseAuraOptions } from "./useAura.js";
import { useAura } from "./useAura.js";
import type { IWebDictation } from "./useWebDictation.js";

const STATE_AURA: Readonly<Record<DictationState, AuraState>> = {
  idle: "hidden",
  recording: "active",
  transcribing: "working",
  done: "hidden",
  error: "hidden",
};

export function useDictationAura(
  anchor: AuraAnchor,
  { state, readLevels }: Pick<IWebDictation, "state" | "readLevels">,
  options: Omit<IUseAuraOptions, "state" | "levels"> = {},
): void {
  useAura(anchor, { ...options, state: STATE_AURA[state], levels: readLevels });
}
