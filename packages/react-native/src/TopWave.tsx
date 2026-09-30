import type { AuraBackground, AuraState, IAuraStyleOptions } from "@saystack/core";
import { useMemo } from "react";
import type { ViewStyle } from "react-native";
import { StyleSheet } from "react-native";

import { auraReach } from "./aura/auraGeometry.js";
import { AuraView } from "./AuraView.js";

interface IProps {
  state: AuraState;
  mode: AuraBackground;
  levels: () => ArrayLike<number> | undefined;
  auraStyle: IAuraStyleOptions;
}

// The aura's bands hanging from the top edge of the screen, as deep as the style reaches.
export function TopWave({ state, mode, levels, auraStyle }: IProps) {
  const height = useMemo(() => auraReach(auraStyle, mode, 0), [auraStyle, mode]);
  const size = useMemo((): ViewStyle => ({ height }), [height]);

  return <AuraView style={[styles.wave, size]} state={state} mode={mode} outline="top-edge" levels={levels} auraStyle={auraStyle} gap={0} />;
}

const styles = StyleSheet.create({
  wave: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
});
