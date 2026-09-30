import type { ISpeechHookResult } from "@saystack/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent, StyleProp, TextStyle, ViewStyle } from "react-native";
import { Animated, Easing, ScrollView, StyleSheet, Text, useWindowDimensions } from "react-native";

import { liftCard } from "../readAloud/cardLayout.js";
import type { IReadingText } from "../readAloud/readAlongMap.js";
import { useReadAlongWord } from "../readAloud/useReadAlongWord.js";
import ReadAlongText from "../ReadAlongText/index.js";
import type { IWindowRect } from "../measure.js";
import type { IVoiceTheme } from "../theme.js";

interface IProps {
  from: IWindowRect;
  text: IReadingText;
  speech: ISpeechHookResult;
  theme: IVoiceTheme;
  isLifted: boolean;
  minTop: number;
  maxBottom: number;
  isSummary: boolean;
  summaryLabel: string;
  textStyle?: StyleProp<TextStyle>;
}

interface IBlockBox {
  y: number;
  height: number;
}

const PAD = 12;

const EDGE = 8;

const RADIUS = 18;

const LABEL_HEIGHT = 22;

const LIFT_MS = 360;

// The reply lifts out of the chat where it sits, reads along word by word and moves only as far as it must.
export function LiftedReply({
  from,
  text,
  speech,
  theme,
  isLifted,
  minTop,
  maxBottom,
  isSummary,
  summaryLabel,
  textStyle,
}: IProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView | null>(null);
  const blocksRef = useRef<IBlockBox[]>([]);
  const scrollYRef = useRef(0);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const { activeWord, seekTo } = useReadAlongWord(speech, text);
  const { width: screenWidth } = useWindowDimensions();
  const themed = useMemo(() => themedStyles(theme), [theme]);
  const top = from.y - PAD;
  const left = Math.max(EDGE, from.x - PAD);
  const width = Math.min(screenWidth - EDGE, from.x + from.width + PAD) - left;
  const natural = contentHeight === null ? null : contentHeight + PAD * 2 + (isSummary ? LABEL_HEIGHT : 0);
  const layout = useMemo(
    () => (natural === null ? null : liftCard({ top, height: natural, minTop, maxBottom, padding: PAD })),
    [natural, top, minTop, maxBottom],
  );
  const bodyHeight = layout?.maxBodyHeight ?? null;
  const dy = layout?.dy ?? 0;

  useEffect(() => {
    if (layout === null) {
      return;
    }

    const animation = Animated.timing(progress, {
      toValue: isLifted ? 1 : 0,
      duration: LIFT_MS,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: true,
    });

    animation.start();

    return () => animation.stop();
  }, [isLifted, layout, progress]);

  const activeBlock = text.blocks.findIndex(
    (block) => activeWord >= (block[0]?.index ?? 0) && activeWord <= (block.at(-1)?.index ?? -1),
  );

  useEffect(() => {
    const box = blocksRef.current[activeBlock];

    if (bodyHeight === null || box === undefined) {
      return;
    }

    const view = scrollYRef.current;

    if (box.y < view + 24 || box.y + Math.min(box.height, 48) > view + bodyHeight - 48) {
      scrollRef.current?.scrollTo({ y: Math.max(0, box.y - bodyHeight / 3), animated: true });
    }
  }, [activeBlock, bodyHeight]);

  const handleContentSize = (_width: number, height: number): void => {
    setContentHeight(height);
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    scrollYRef.current = event.nativeEvent.contentOffset.y;
  };

  const handleBlockLayout = useCallback((block: number, y: number, height: number) => {
    blocksRef.current[block] = { y, height };
  }, []);

  const place = useMemo((): ViewStyle => ({ left, top, width }), [left, top, width]);
  const motion = useMemo(
    () => ({
      transform: [
        { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
        { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] }) },
      ],
    }),
    [progress, dy],
  );
  const surface = useMemo(() => ({ opacity: progress }), [progress]);
  const words = useMemo(
    () => ({ opacity: progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] }) }),
    [progress],
  );
  const body = useMemo((): ViewStyle | null => (bodyHeight === null ? null : { maxHeight: bodyHeight }), [bodyHeight]);

  return (
    <Animated.View style={[styles.card, place, motion]}>
      <Animated.View style={[styles.surface, themed.surface, surface]} pointerEvents="none" />
      <Animated.View style={words}>
        {isSummary ? <Text style={[styles.label, themed.label]}>{summaryLabel.toUpperCase()}</Text> : null}
        <ScrollView
          ref={scrollRef}
          style={body}
          scrollEnabled={bodyHeight !== null}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={handleContentSize}
          onScroll={handleScroll}
          scrollEventThrottle={32}
        >
          <ReadAlongText
            text={text}
            activeWord={activeWord}
            theme={theme}
            onWordPress={seekTo}
            onBlockLayout={handleBlockLayout}
            {...(textStyle === undefined ? {} : { textStyle })}
          />
        </ScrollView>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    padding: PAD,
    borderRadius: RADIUS,
  },
  surface: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: RADIUS,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 1,
    shadowRadius: 22,
    elevation: 14,
  },
  label: {
    height: LABEL_HEIGHT,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
  },
});

function themedStyles(theme: IVoiceTheme) {
  return StyleSheet.create({
    surface: {
      backgroundColor: theme.surface,
      shadowColor: theme.shadow,
    },
    label: {
      color: theme.textMuted,
    },
  });
}
