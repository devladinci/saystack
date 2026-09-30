import type { ISpeechHookResult } from "@saystack/react";
import { estimateDurations, formatClock, useSpeechProgress } from "@saystack/react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import type { IReadAloudLabels } from "../labels.js";
import { readAloudLabels } from "../labels.js";
import type { IVoiceTheme } from "../theme.js";
import type { PlayerIconName } from "./PlayerIcon.js";
import { PlayerIcon } from "./PlayerIcon.js";
import { PlayerTrack } from "./PlayerTrack.js";

export type PlayerIconRenderer = (name: PlayerIconName, color: string, size: number) => ReactNode;

interface IProps {
  speech: ISpeechHookResult;
  theme: IVoiceTheme;
  isSummary?: boolean;
  labels?: Partial<IReadAloudLabels>;
  renderIcon?: PlayerIconRenderer;
  onClose?: () => void;
  style?: StyleProp<ViewStyle>;
}

const RESTART_AFTER_SECONDS = 1.5;

const defaultIcon: PlayerIconRenderer = (name, color, size) => <PlayerIcon name={name} color={color} size={size} />;

export default function ReadAloudPlayer({ speech, theme, isSummary = false, labels, renderIcon = defaultIcon, onClose, style }: IProps) {
  const [state, api] = speech;
  const position = useSpeechProgress(speech);
  const text = useMemo(() => readAloudLabels(labels), [labels]);
  const themed = useMemo(() => themedStyles(theme), [theme]);
  const { phase, chunks, chunkIndex } = state;
  const durations = estimateDurations(chunks);
  const isInStep = position.chunkIndex === chunkIndex;
  const time = isInStep ? position.time : 0;
  const elapsed = durations.slice(0, Math.max(0, chunkIndex)).reduce((sum, seconds) => sum + seconds, 0) + time;
  const total = durations.reduce((sum, seconds) => sum + seconds, 0);
  const isEnded = phase === "done" || phase === "error";

  const title = (): string => {
    if (phase === "loading") {
      return chunkIndex < 0 ? text.preparing : isSummary ? text.readingSummary : text.reading;
    }

    if (phase === "paused") {
      return text.paused;
    }

    if (phase === "done") {
      return `${text.finished} · ${formatClock(total, true)}`;
    }

    if (phase === "error") {
      return (state.errorCode === null ? undefined : text.errors[state.errorCode]) ?? state.errorMessage ?? text.failed;
    }

    return isSummary ? text.readingSummary : text.reading;
  };

  const primary: Record<string, [PlayerIconName, string]> = {
    loading: ["pause", text.stop],
    playing: ["pause", text.pause],
    paused: ["play", text.resume],
    done: ["replay", text.replay],
    error: ["replay", text.retry],
  };
  const [primaryIcon, primaryLabel] = primary[phase] ?? ["play", text.resume];

  const handlePrimary = (): void => {
    if (phase === "playing") {
      api.pause();
      return;
    }

    if (phase === "paused") {
      api.resume();
      return;
    }

    if (phase === "loading") {
      api.stop();
      return;
    }

    api.replay();
  };

  const handlePrevious = (): void => {
    api.seek(time > RESTART_AFTER_SECONDS ? chunkIndex : Math.max(0, chunkIndex - 1));
  };

  const handleNext = (): void => {
    api.seek(chunkIndex + 1);
  };

  const handleClose = (): void => {
    if (onClose === undefined) {
      api.stop();
      return;
    }

    onClose();
  };

  const handleSeek = (fraction: number): void => {
    let remaining = fraction * total;

    for (let index = 0; index < durations.length; index += 1) {
      const seconds = durations[index] ?? 0;

      if (remaining <= seconds || index === durations.length - 1) {
        api.seek(index, Math.max(0, Math.min(seconds, remaining)));
        return;
      }

      remaining -= seconds;
    }
  };

  if (phase === "idle") {
    return null;
  }

  return (
    <View style={[styles.player, themed.player, style]} accessibilityLabel={text.region}>
      <View style={styles.top}>
        <Text style={[styles.title, phase === "error" ? themed.danger : themed.text]} numberOfLines={1}>
          {title()}
        </Text>
        <Text style={[styles.time, themed.muted]}>
          {formatClock(elapsed)} / {formatClock(total, true)}
        </Text>
      </View>
      <PlayerTrack progress={total > 0 ? elapsed / total : 0} theme={theme} label={text.region} onSeek={handleSeek} />
      <View style={styles.controls}>
        <View style={styles.side}>
          <Pressable
            style={[styles.small, isEnded || chunkIndex < 0 ? styles.disabled : null]}
            disabled={isEnded || chunkIndex < 0}
            onPress={handlePrevious}
            accessibilityRole="button"
            accessibilityLabel={text.previous}
            hitSlop={8}
          >
            {renderIcon("previous", theme.text, 20)}
          </Pressable>
          <Pressable
            style={[styles.small, isEnded || chunkIndex >= chunks.length - 1 ? styles.disabled : null]}
            disabled={isEnded || chunkIndex < 0 || chunkIndex >= chunks.length - 1}
            onPress={handleNext}
            accessibilityRole="button"
            accessibilityLabel={text.next}
            hitSlop={8}
          >
            {renderIcon("next", theme.text, 20)}
          </Pressable>
        </View>
        <Pressable style={[styles.primary, themed.primary]} onPress={handlePrimary} accessibilityRole="button" accessibilityLabel={primaryLabel}>
          {phase === "loading" && chunkIndex < 0 ? <ActivityIndicator color={theme.accentInk} /> : renderIcon(primaryIcon, theme.accentInk, 26)}
        </Pressable>
        <View style={[styles.side, styles.end]}>
          <Pressable style={styles.small} onPress={handleClose} accessibilityRole="button" accessibilityLabel={text.close} hitSlop={8}>
            {renderIcon("close", theme.text, 20)}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  player: {
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 12,
  },
  top: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
  },
  title: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
  },
  time: {
    fontSize: 11.5,
    fontVariant: ["tabular-nums"],
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  side: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  end: {
    justifyContent: "flex-end",
  },
  small: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.35,
  },
  primary: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
});

function themedStyles(theme: IVoiceTheme) {
  return StyleSheet.create({
    player: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      shadowColor: theme.shadow,
    },
    text: {
      color: theme.text,
    },
    muted: {
      color: theme.textMuted,
    },
    danger: {
      color: theme.danger,
    },
    primary: {
      backgroundColor: theme.accent,
    },
  });
}
