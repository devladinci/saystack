import { useMemo, useState } from "react";
import type { GestureResponderEvent, LayoutChangeEvent, ViewStyle } from "react-native";
import { Pressable, StyleSheet, View } from "react-native";

import type { IVoiceTheme } from "../theme.js";

interface IProps {
  progress: number;
  theme: IVoiceTheme;
  label: string;
  onSeek: (fraction: number) => void;
}

export function PlayerTrack({ progress, theme, label, onSeek }: IProps) {
  const [width, setWidth] = useState(0);
  const themed = useMemo(() => themedStyles(theme), [theme]);
  const filled = useMemo((): ViewStyle => ({ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 1000) / 10}%` }), [progress]);

  const handleLayout = (event: LayoutChangeEvent): void => {
    setWidth(event.nativeEvent.layout.width);
  };

  const handlePress = (event: GestureResponderEvent): void => {
    if (width > 0) {
      onSeek(Math.min(1, Math.max(0, event.nativeEvent.locationX / width)));
    }
  };

  return (
    <Pressable style={styles.hit} onLayout={handleLayout} onPress={handlePress} accessibilityRole="adjustable" accessibilityLabel={label}>
      <View style={[styles.rail, themed.rail]}>
        <View style={[styles.fill, themed.fill, filled]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    height: 18,
    justifyContent: "center",
  },
  rail: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  fill: {
    height: 4,
  },
});

function themedStyles(theme: IVoiceTheme) {
  return StyleSheet.create({
    rail: {
      backgroundColor: theme.surfaceMuted,
    },
    fill: {
      backgroundColor: theme.accent,
    },
  });
}
