import { useMemo, useState } from "react";
import type { NativeSyntheticEvent, StyleProp, TextLayoutEventData, ViewStyle } from "react-native";
import { Animated, StyleSheet, Text, View } from "react-native";

import { CAPTION_LINE_HEIGHT, CAPTION_STEPS, fitCaption, visibleCaptionLines } from "../captions/captionSteps.js";
import type { IVoiceTheme } from "../theme.js";
import type { ICaptionLine } from "./CaptionLines.js";
import { CaptionLines } from "./CaptionLines.js";
import { useShimmer } from "./useShimmer.js";

interface IProps {
  text: string;
  placeholder: string;
  hint: string;
  theme: IVoiceTheme;
  isCancelling?: boolean;
  isWorking?: boolean;
  style?: StyleProp<ViewStyle>;
}

const keyedLines = (texts: readonly string[]): ICaptionLine[] => {
  let offset = 0;

  return texts.map((text) => {
    const line = { key: String(offset), text };
    offset += text.length;

    return line;
  });
};

// Live words in the middle of the screen. Mount it again for each dictation to start from the largest size.
export default function LiveCaptions({
  text,
  placeholder,
  hint,
  theme,
  isCancelling = false,
  isWorking = false,
  style,
}: IProps) {
  const [step, setStep] = useState(0);
  const [lines, setLines] = useState<readonly ICaptionLine[]>([]);
  const [isScrolling, setIsScrolling] = useState(false);
  const shimmer = useShimmer(isWorking);
  const fontSize = CAPTION_STEPS[step]?.fontSize ?? 18;
  const themed = useMemo(() => themedStyles(theme), [theme]);
  const sized = useMemo(
    () => ({ fontSize, lineHeight: Math.round(fontSize * CAPTION_LINE_HEIGHT), letterSpacing: fontSize * -0.015 }),
    [fontSize],
  );
  const breathing = useMemo(() => (isWorking ? { opacity: shimmer } : null), [isWorking, shimmer]);
  const isIdle = text === "";

  const handleTextLayout = (event: NativeSyntheticEvent<TextLayoutEventData>): void => {
    const measured = event.nativeEvent.lines.map((line) => line.text);
    const next = fitCaption(step, measured.length);

    if (next.step !== step) {
      setStep(next.step);
      return;
    }

    setIsScrolling(next.isScrolling);
    setLines(keyedLines(measured));
  };

  return (
    <View style={[styles.area, style]} pointerEvents="none">
      <View style={styles.column}>
        {isIdle ? null : (
          <Text style={[styles.caption, styles.measure, sized]} onTextLayout={handleTextLayout}>
            {text}
          </Text>
        )}
        {isIdle ? (
          <Animated.Text style={[styles.caption, styles.idle, themed.muted, breathing]}>{placeholder}</Animated.Text>
        ) : isScrolling ? (
          <CaptionLines
            lines={visibleCaptionLines(lines, step)}
            textStyle={[styles.caption, sized, themed.text, isCancelling ? styles.faded : null]}
          />
        ) : (
          <Animated.Text style={[styles.caption, sized, themed.text, isCancelling ? styles.faded : null, breathing]}>
            {text}
          </Animated.Text>
        )}
      </View>
      <Text style={[styles.hint, isCancelling ? themed.danger : themed.muted]}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  area: {
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 30,
  },
  column: {
    alignSelf: "stretch",
  },
  caption: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: "500",
    textAlign: "center",
  },
  measure: {
    position: "absolute",
    left: 0,
    right: 0,
    opacity: 0,
  },
  idle: {
    fontWeight: "400",
  },
  faded: {
    opacity: 0.35,
  },
  hint: {
    fontSize: 13,
    minHeight: 18,
    textAlign: "center",
  },
});

function themedStyles(theme: IVoiceTheme) {
  return StyleSheet.create({
    text: {
      color: theme.text,
    },
    muted: {
      color: theme.textMuted,
    },
    danger: {
      color: theme.danger,
    },
  });
}
