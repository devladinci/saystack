import { useCallback, useEffect, useState } from "react";

import type { ISettings } from "./settings.js";
import { decodeSettings, DEFAULT_SETTINGS, encodeSettings } from "./settings.js";

export interface ISettingsState {
  settings: ISettings;
  update: (next: Partial<ISettings>) => void;
  reset: () => void;
}

// The settings live in the URL hash, so a link brings back the same look.
export function useSettings(): ISettingsState {
  const [settings, setSettings] = useState(() => decodeSettings(window.location.hash));

  useEffect(() => {
    const hash = encodeSettings(settings);
    const url = `${window.location.pathname}${window.location.search}${hash === "" ? "" : `#${hash}`}`;
    window.history.replaceState(null, "", url);
  }, [settings]);

  const update = useCallback((next: Partial<ISettings>) => {
    setSettings((current) => ({ ...current, ...next }));
  }, []);

  const reset = useCallback(() => {
    setSettings((current) => ({ ...DEFAULT_SETTINGS, theme: current.theme }));
  }, []);

  return { settings, update, reset };
}
