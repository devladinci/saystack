import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";

// A slow breath for words that are still being worked out.
export function useShimmer(isActive: boolean): Animated.Value {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isActive) {
      opacity.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.45, duration: 550, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 550, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );

    loop.start();

    return () => loop.stop();
  }, [isActive, opacity]);

  return opacity;
}
