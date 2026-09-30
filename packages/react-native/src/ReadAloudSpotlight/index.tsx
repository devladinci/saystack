import type { AuraState, IAuraStyleOptions, TtsPhase } from "@saystack/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LayoutChangeEvent, StyleProp, TextStyle, ViewStyle } from "react-native";
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from "react-native";

import { TOP_WAVE_STYLE } from "../aura/auraGeometry.js";
import type { IReadAloudLabels } from "../labels.js";
import { readAloudLabels } from "../labels.js";
import type { IWindowRect } from "../measure.js";
import { measureInWindow } from "../measure.js";
import { Passthrough } from "../Passthrough.js";
import { readingText } from "../readAloud/readAlongMap.js";
import { useReadAloud } from "../readAloud/useReadAloud.js";
import type { PlayerIconRenderer } from "../ReadAloudPlayer/index.js";
import ReadAloudPlayer from "../ReadAloudPlayer/index.js";
import { SpotlightBackdrop } from "../SpotlightBackdrop.js";
import type { SpotlightContainer } from "../spotlightContainer.js";
import type { IVoiceTheme } from "../theme.js";
import { TopWave } from "../TopWave.js";
import { LiftedReply } from "./LiftedReply.js";

interface IProps {
  theme: IVoiceTheme;
  container?: SpotlightContainer;
  top?: number;
  bottomInset?: number;
  labels?: Partial<IReadAloudLabels>;
  auraStyle?: IAuraStyleOptions;
  blur?: number;
  dim?: number;
  textStyle?: StyleProp<TextStyle>;
  renderIcon?: PlayerIconRenderer;
  closeDelayMs?: number;
}

const PHASE_AURA: Readonly<Record<TtsPhase, AuraState>> = {
  idle: "hidden",
  loading: "working",
  playing: "active",
  paused: "paused",
  done: "hidden",
  error: "hidden",
};

const PLAYER_GAP = 16;

const PLAYER_ESTIMATE = 126;

const UNMOUNT_MS = 420;

const fallbackRect = (width: number, height: number): IWindowRect => ({ x: 16, y: height * 0.35, width: width - 32, height: 80 });

// Reading a reply: the chat blurs, the aura's bands hang from the top edge as it speaks, the reply lifts
// with its words marked as they are read, and the player waits at the bottom. The blur stays until the
// reading ends or the player is closed.
export default function ReadAloudSpotlight({
  theme,
  container: Container = Passthrough,
  top = 100,
  bottomInset = 0,
  labels,
  auraStyle = TOP_WAVE_STYLE,
  blur,
  dim,
  textStyle,
  renderIcon,
  closeDelayMs = 1100,
}: IProps) {
  const { speech, anchor, messageId, isSummary, readLevels } = useReadAloud();
  const [state, api] = speech;
  const { phase } = state;
  const isReading = phase === "loading" || phase === "playing" || phase === "paused" || phase === "error";
  const [isLingering, setIsLingering] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [from, setFrom] = useState<IWindowRect | null>(null);
  const [playerHeight, setPlayerHeight] = useState(PLAYER_ESTIMATE);
  const slide = useRef(new Animated.Value(0)).current;
  const { width, height } = useWindowDimensions();
  const copy = useMemo(() => readAloudLabels(labels), [labels]);
  const isOpen = messageId !== null && (isReading || isLingering);
  const shown = isSummary ? state.chunks.map((chunk) => chunk.text).join(" ") : state.text;
  const reading = useMemo(() => readingText(shown), [shown]);
  const playerBottom = bottomInset + 8;

  useEffect(() => {
    if (phase !== "done") {
      setIsLingering(false);
      return;
    }

    setIsLingering(true);
    const timer = setTimeout(() => setIsLingering(false), closeDelayMs);

    return () => clearTimeout(timer);
  }, [phase, closeDelayMs]);

  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      return;
    }

    const timer = setTimeout(() => {
      setIsMounted(false);
      setFrom(null);
    }, UNMOUNT_MS);

    return () => clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isCurrent = true;

    void measureInWindow(anchor).then((rect) => {
      if (isCurrent) {
        setFrom(rect ?? fallbackRect(width, height));
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [isOpen, anchor, messageId, width, height]);

  useEffect(() => {
    const animation = Animated.timing(slide, {
      toValue: isOpen ? 1 : 0,
      duration: 320,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: true,
    });

    animation.start();

    return () => animation.stop();
  }, [isOpen, slide]);

  const player = useMemo(
    () => ({
      bottom: playerBottom,
      transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [playerHeight + playerBottom + 40, 0] }) }],
    }),
    [slide, playerHeight, playerBottom],
  );
  const playerStyle = useMemo((): StyleProp<ViewStyle> => [styles.player, player], [player]);

  const handlePlayerLayout = (event: LayoutChangeEvent): void => {
    setPlayerHeight(event.nativeEvent.layout.height);
  };

  if (!isMounted) {
    return null;
  }

  return (
    <Container>
      <View style={StyleSheet.absoluteFill} pointerEvents={isOpen ? "box-none" : "none"}>
        <SpotlightBackdrop
          isVisible={isOpen}
          theme={theme}
          isBlocking={isOpen}
          {...(blur === undefined ? {} : { blur })}
          {...(dim === undefined ? {} : { dim })}
        />
        <TopWave state={isOpen ? PHASE_AURA[phase] : "hidden"} mode={theme.mode} levels={readLevels} auraStyle={auraStyle} />
        {from === null ? null : (
          <LiftedReply
            key={String(messageId)}
            from={from}
            text={reading}
            speech={speech}
            theme={theme}
            isLifted={isOpen}
            minTop={top + 10}
            maxBottom={height - playerBottom - playerHeight - PLAYER_GAP}
            isSummary={isSummary}
            summaryLabel={copy.summary}
            {...(textStyle === undefined ? {} : { textStyle })}
          />
        )}
        <Animated.View style={playerStyle} onLayout={handlePlayerLayout}>
          <ReadAloudPlayer
            speech={speech}
            theme={theme}
            isSummary={isSummary}
            onClose={api.stop}
            {...(labels === undefined ? {} : { labels })}
            {...(renderIcon === undefined ? {} : { renderIcon })}
          />
        </Animated.View>
      </View>
    </Container>
  );
}

const styles = StyleSheet.create({
  player: {
    position: "absolute",
    left: 10,
    right: 10,
  },
});
