import type { AuraBackground } from "@saystack/core";

export interface IVoiceTheme {
  mode: AuraBackground;
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentInk: string;
  danger: string;
  highlight: string;
  highlightInk: string;
  shadow: string;
}

export const LIGHT_VOICE_THEME: IVoiceTheme = {
  mode: "light",
  background: "#fefdfb",
  surface: "#ffffff",
  surfaceMuted: "#f0eee9",
  border: "#e2dfd7",
  text: "#2c2a26",
  textMuted: "#6b7280",
  accent: "#0f766e",
  accentInk: "#ffffff",
  danger: "#d73a49",
  highlight: "rgba(15, 118, 110, 0.17)",
  highlightInk: "#0b4a44",
  shadow: "rgba(40, 36, 28, 0.26)",
};

export const DARK_VOICE_THEME: IVoiceTheme = {
  mode: "dark",
  background: "#1a1a1a",
  surface: "#262626",
  surfaceMuted: "#333333",
  border: "#3a3a3a",
  text: "#e8e8e8",
  textMuted: "#9ca3af",
  accent: "#14b8a6",
  accentInk: "#0b1f1c",
  danger: "#f47067",
  highlight: "rgba(20, 184, 166, 0.26)",
  highlightInk: "#e2fbf6",
  shadow: "rgba(0, 0, 0, 0.62)",
};

export function voiceTheme(mode: AuraBackground, overrides: Partial<Omit<IVoiceTheme, "mode">> = {}): IVoiceTheme {
  return { ...(mode === "dark" ? DARK_VOICE_THEME : LIGHT_VOICE_THEME), ...overrides, mode };
}
