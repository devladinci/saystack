import { useEffect, useMemo, useRef, useState } from "react";
import type { ViewStyle } from "react-native";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";

import { expoBlur } from "./optionalModules.js";
import type { IVoiceTheme } from "./theme.js";

interface IProps {
  isVisible: boolean;
  theme: IVoiceTheme;
  blur?: number;
  dim?: number;
  bottom?: number;
  isBlocking?: boolean;
  onPress?: () => void;
}

const FADE_MS = 220;

// Without the blur's native code the veil alone has to hide the chat behind the spotlight.
const VEIL_WITHOUT_BLUR = 0.86;

// Blurs and dims the screen above `bottom`; what sits below it stays sharp, as if lifted over the blur.
export function SpotlightBackdrop({
  isVisible,
  theme,
  blur = 32,
  dim = 0.35,
  bottom = 0,
  isBlocking = false,
  onPress,
}: IProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const [isShown, setIsShown] = useState(isVisible);

  useEffect(() => {
    if (isVisible) {
      setIsShown(true);
    }

    const animation = Animated.timing(progress, {
      toValue: isVisible ? 1 : 0,
      duration: FADE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    });

    animation.start(({ finished }) => {
      if (finished && !isVisible) {
        setIsShown(false);
      }
    });

    return () => animation.stop();
  }, [isVisible, progress]);

  const area = useMemo((): ViewStyle => ({ bottom }), [bottom]);
  const veilOpacity = expoBlur === null ? Math.max(dim, VEIL_WITHOUT_BLUR) : dim;
  const veil = useMemo(
    () => ({
      backgroundColor: theme.background,
      opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, veilOpacity] }),
    }),
    [theme.background, progress, veilOpacity],
  );
  const intensity = useMemo(
    () => progress.interpolate({ inputRange: [0, 1], outputRange: [0, blur] }),
    [progress, blur],
  );

  if (!isShown) {
    return null;
  }

  return (
    <View style={[styles.area, area]} pointerEvents={isBlocking ? "auto" : "none"}>
      {expoBlur === null ? null : (
        <expoBlur.AnimatedBlurView
          style={StyleSheet.absoluteFill}
          intensity={intensity}
          tint={theme.mode === "dark" ? "dark" : "light"}
        />
      )}
      <Animated.View style={[StyleSheet.absoluteFill, veil]} />
      {isBlocking ? <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={onPress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  area: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
});
