import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing } from "react-native";

// The words shrink toward the composer and fade as they land in the draft.
export function useDropMotion(isDropping: boolean, distance: number) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isDropping) {
      progress.setValue(0);
      return;
    }

    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 340,
      easing: Easing.bezier(0.3, 0.7, 0.2, 1),
      useNativeDriver: true,
    });

    animation.start();

    return () => animation.stop();
  }, [isDropping, progress]);

  return useMemo(
    () => ({
      opacity: progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.35, 0] }),
      transform: [
        { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, distance] }) },
        { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }) },
      ],
    }),
    [progress, distance],
  );
}
