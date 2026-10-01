import { requireOptionalNativeModule } from "expo-modules-core";
import { Animated } from "react-native";

type ExpoGl = typeof import("expo-gl");

type ExpoBlur = typeof import("expo-blur");

export interface IBlurModule {
  BlurView: ExpoBlur["BlurView"];
  AnimatedBlurView: Animated.AnimatedComponent<ExpoBlur["BlurView"]>;
}

declare const require: (name: string) => unknown;

// expo-gl and expo-blur throw as soon as they run in a build that lacks their native code, such as
// a dev client built before they were added. They are required only once that code is known to be there.
const optional = <T>(nativeName: string, load: () => T): T | null => {
  if (requireOptionalNativeModule(nativeName) === null) {
    return null;
  }

  try {
    return load();
  } catch {
    return null;
  }
};

export const expoGl = optional("ExpoGL", () => require("expo-gl") as ExpoGl);

export const expoBlur = optional("ExpoBlur", (): IBlurModule => {
  const { BlurView } = require("expo-blur") as ExpoBlur;

  return { BlurView, AnimatedBlurView: Animated.createAnimatedComponent(BlurView) };
});
