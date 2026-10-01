import type { AuraBackground, IAuraStyle, IAuraStyleOptions } from "@saystack/core";
import {
  AURA_LAYOUTS,
  AURA_OUTLINES,
  AURA_PALETTES,
  AURA_PLACEMENTS,
  AURA_RANGES,
  auraStyleFor,
  MESSAGE_AURA_STYLE,
  resolveAuraStyle,
} from "@saystack/core";

export type Theme = "system" | "light" | "dark";
export type DictationSource = "mic" | "demo";
export type DictationAnchor = "composer" | "mic" | "page";
export type ReadAloudAnchor = "message" | "chat" | "player" | "page";
export type AuraTarget = "dictation" | "readAloud";
export type View = "desktop" | "mobile";
export type StyleOverrides = Partial<IAuraStyle>;

export interface ISettings {
  theme: Theme;
  dictation: StyleOverrides;
  readAloud: StyleOverrides;
  source: DictationSource;
  dictationAnchor: DictationAnchor;
  readAloudAnchor: ReadAloudAnchor;
  hasLatency: boolean;
  view: View;
}

export const DEFAULT_SETTINGS: Readonly<ISettings> = {
  theme: "system",
  dictation: {},
  readAloud: {},
  source: "demo",
  dictationAnchor: "composer",
  readAloudAnchor: "message",
  hasLatency: true,
  view: "desktop",
};

const STYLE_CHOICES: Readonly<Record<string, readonly string[]>> = {
  layout: AURA_LAYOUTS,
  palette: AURA_PALETTES,
  placement: AURA_PLACEMENTS,
  outline: AURA_OUTLINES,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const oneOf = <T extends string>(choices: readonly T[], value: unknown, fallback: T): T =>
  choices.find((choice) => choice === value) ?? fallback;

function sanitizeStyle(value: unknown): StyleOverrides {
  if (!isRecord(value)) {
    return {};
  }

  const kept: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    const choices = STYLE_CHOICES[key];
    const isNumber = key in AURA_RANGES && typeof entry === "number" && Number.isFinite(entry);

    if (isNumber || (choices !== undefined && choices.includes(String(entry)))) {
      kept[key] = entry;
    }
  }

  const resolved = resolveAuraStyle(kept as StyleOverrides);
  const overrides: StyleOverrides = {};

  for (const key of Object.keys(kept) as (keyof IAuraStyle)[]) {
    Object.assign(overrides, { [key]: resolved[key] });
  }

  return overrides;
}

export function readAloudStyleOptions(overrides: StyleOverrides): IAuraStyleOptions {
  const dark: StyleOverrides = { ...MESSAGE_AURA_STYLE.dark };
  const light: StyleOverrides = { ...MESSAGE_AURA_STYLE.light };
  const shared: StyleOverrides = {};

  for (const [key, value] of Object.entries(overrides)) {
    if (key in dark || key in light) {
      Object.assign(dark, { [key]: value });
      Object.assign(light, { [key]: value });
    } else {
      Object.assign(shared, { [key]: value });
    }
  }

  const { dark: _dark, light: _light, ...base } = MESSAGE_AURA_STYLE;

  return { ...base, ...shared, dark, light };
}

// On mobile both spotlights hang the same wave from the top edge, so read-aloud has no glow defaults to start from.
export function effectiveStyle(
  target: AuraTarget,
  overrides: StyleOverrides,
  background: AuraBackground,
  view: View,
): IAuraStyle {
  if (target === "dictation" || view === "mobile") {
    return resolveAuraStyle(overrides);
  }

  return resolveAuraStyle(auraStyleFor(readAloudStyleOptions(overrides), background));
}

export function encodeSettings(settings: ISettings): string {
  const changed: Record<string, unknown> = {};

  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof ISettings)[]) {
    const value = settings[key];
    const isEmpty = isRecord(value) && Object.keys(value).length === 0;

    if (value !== DEFAULT_SETTINGS[key] && !isEmpty) {
      changed[key] = value;
    }
  }

  return Object.keys(changed).length === 0 ? "" : encodeURIComponent(JSON.stringify(changed));
}

export function decodeSettings(hash: string): ISettings {
  let parsed: unknown;

  try {
    parsed = JSON.parse(decodeURIComponent(hash.replace(/^#/, "")));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }

  if (!isRecord(parsed)) {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    theme: oneOf<Theme>(["system", "light", "dark"], parsed.theme, DEFAULT_SETTINGS.theme),
    dictation: sanitizeStyle(parsed.dictation),
    readAloud: sanitizeStyle(parsed.readAloud),
    source: oneOf<DictationSource>(["mic", "demo"], parsed.source, DEFAULT_SETTINGS.source),
    dictationAnchor: oneOf<DictationAnchor>(
      ["composer", "mic", "page"],
      parsed.dictationAnchor,
      DEFAULT_SETTINGS.dictationAnchor,
    ),
    readAloudAnchor: oneOf<ReadAloudAnchor>(
      ["message", "chat", "player", "page"],
      parsed.readAloudAnchor,
      DEFAULT_SETTINGS.readAloudAnchor,
    ),
    hasLatency: typeof parsed.hasLatency === "boolean" ? parsed.hasLatency : DEFAULT_SETTINGS.hasLatency,
    view: oneOf<View>(["desktop", "mobile"], parsed.view, DEFAULT_SETTINGS.view),
  };
}

const literal = (value: unknown): string => (typeof value === "string" ? `"${value}"` : String(value));

const objectLiteral = (entries: object): string =>
  `{ ${Object.entries(entries)
    .map(([key, value]) => `${key}: ${isRecord(value) ? objectLiteral(value) : literal(value)}`)
    .join(", ")} }`;

const isTuned = (overrides: StyleOverrides): boolean => Object.keys(overrides).length > 0;

function webSnippet({ dictation, readAloud }: ISettings): string {
  const dictationOptions = isTuned(dictation) ? `, { style: ${objectLiteral(dictation)} }` : "";
  const readAloudProps = isTuned(readAloud) ? ` style={${objectLiteral(readAloudStyleOptions(readAloud))}}` : "";
  const dictationBands = dictation.bands === undefined ? "" : `, bands: ${dictation.bands}`;
  const readAloudBands = readAloud.bands === undefined ? "" : ` bands={${readAloud.bands}}`;

  return [
    'import { ReadAloudAura, ReadAloudProvider, useDictationAura, useWebDictation } from "@saystack/react-web";',
    "",
    `const dictation = useWebDictation({ endpoint: "/voice/audio/transcriptions"${dictationBands} });`,
    `useDictationAura(composerRef, dictation${dictationOptions});`,
    "",
    `<ReadAloudProvider endpoint="/voice/speech"${readAloudBands}>`,
    `  <ReadAloudAura${readAloudProps} />`,
    "</ReadAloudProvider>",
  ].join("\n");
}

function nativeSnippet({ dictation, readAloud }: ISettings): string {
  const dictationStyle = isTuned(dictation) ? ` auraStyle={${objectLiteral(dictation)}}` : "";
  const readAloudStyle = isTuned(readAloud) ? ` auraStyle={${objectLiteral(readAloud)}}` : "";
  const dictationBands = dictation.bands === undefined ? "" : ` bands: ${dictation.bands},`;
  const readAloudBands = readAloud.bands === undefined ? "" : ` bands={${readAloud.bands}}`;

  return [
    "import {",
    "  DictationSpotlight,",
    "  ReadAloudProvider,",
    "  ReadAloudSpotlight,",
    "  useHoldToTalk,",
    "  useNativeDictation,",
    "  voiceTheme,",
    '} from "@saystack/react-native";',
    'import { useColorScheme } from "react-native";',
    "",
    'const theme = voiceTheme(useColorScheme() === "dark" ? "dark" : "light");',
    `const dictation = useNativeDictation({ endpoint: \`\${API}/audio/transcriptions\`,${dictationBands} onInsert: setDraft });`,
    "const hold = useHoldToTalk({",
    "  onStart: dictation.handlePressStart,",
    "  onEnd: dictation.handlePressEnd,",
    "  onCancel: dictation.handleCancel,",
    "});",
    "",
    `<DictationSpotlight dictation={dictation} hold={hold} theme={theme}${dictationStyle} />`,
    "",
    `<ReadAloudProvider endpoint={\`\${API}/speech\`}${readAloudBands}>`,
    `  <ReadAloudSpotlight theme={theme}${readAloudStyle} />`,
    "</ReadAloudProvider>",
  ].join("\n");
}

export function configSnippet(settings: ISettings): string {
  return settings.view === "mobile" ? nativeSnippet(settings) : webSnippet(settings);
}
