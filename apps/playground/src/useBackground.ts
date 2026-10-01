import type { AuraBackground } from "@saystack/core";
import { useEffect, useSyncExternalStore } from "react";

import type { Theme } from "./settings.js";

const LIGHT_QUERY = "(prefers-color-scheme: light)";

const subscribe = (onChange: () => void): (() => void) => {
  const query = window.matchMedia(LIGHT_QUERY);
  query.addEventListener("change", onChange);

  return () => query.removeEventListener("change", onChange);
};

const systemBackground = (): AuraBackground => (window.matchMedia(LIGHT_QUERY).matches ? "light" : "dark");

export function useBackground(theme: Theme): AuraBackground {
  const system = useSyncExternalStore(subscribe, systemBackground, (): AuraBackground => "dark");

  useEffect(() => {
    const root = document.documentElement;

    if (theme === "system") {
      delete root.dataset.theme;
      return;
    }

    root.dataset.theme = theme;
  }, [theme]);

  return theme === "system" ? system : theme;
}
