import type {
  AuraBackground,
  AuraClip,
  AuraState,
  IAuraHost,
  IAuraRect,
  IAuraRenderer,
  IAuraStyleOptions,
} from "@saystack/core";
import { createAuraRenderer } from "@saystack/core";
import type { ExpoWebGLRenderingContext } from "expo-gl";
import { useEffect, useRef, useState } from "react";
import type { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native";
import { AccessibilityInfo, StyleSheet } from "react-native";

import { topEdgeClip, topEdgeOutline } from "./aura/auraGeometry.js";
import { createFrameBudget } from "./aura/frameBudget.js";
import { expoGl } from "./optionalModules.js";

export interface IAuraOutlineRect {
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
  isInside?: boolean;
}

// "top-edge" hangs the aura from the view's top edge down; a rect draws it around that box, in the view's points.
export type AuraOutline = "top-edge" | IAuraOutlineRect;

interface IProps {
  state: AuraState;
  mode: AuraBackground;
  outline: AuraOutline;
  levels?: () => ArrayLike<number> | undefined;
  auraStyle?: IAuraStyleOptions;
  gap?: number;
  glideMs?: number;
  style?: StyleProp<ViewStyle>;
}

interface ISize {
  width: number;
  height: number;
}

interface ILatest {
  mode: AuraBackground;
  outline: AuraOutline;
  size: ISize;
}

const NO_STYLE: IAuraStyleOptions = {};

const rectOf = (outline: AuraOutline, size: ISize): IAuraRect => {
  if (outline === "top-edge") {
    return topEdgeOutline(size.width);
  }

  const radius = Math.max(0, Math.min(outline.radius ?? 0, outline.width / 2, outline.height / 2));

  return {
    x: outline.x,
    y: outline.y,
    w: outline.width,
    h: outline.height,
    r: radius,
    isPage: false,
    isInner: outline.isInside === true,
  };
};

const clipOf = (outline: AuraOutline, size: ISize): AuraClip | null =>
  outline === "top-edge" ? topEdgeClip(size.width, size.height) : null;

// saystack's aura shader on the GPU, drawn over what is behind it: light adds up on dark, and covers on light.
export function AuraView({
  state,
  mode,
  outline,
  levels,
  auraStyle = NO_STYLE,
  gap = 1.5,
  glideMs = 480,
  style,
}: IProps) {
  const [size, setSize] = useState<ISize>({ width: 0, height: 0 });
  const rendererRef = useRef<IAuraRenderer | null>(null);
  const wakeRef = useRef<(() => void) | null>(null);
  const levelsRef = useRef(levels);
  const reducedRef = useRef(false);
  const latestRef = useRef<ILatest>({ mode, outline, size });

  useEffect(() => {
    latestRef.current = { mode, outline, size };
    levelsRef.current = levels;
  });

  useEffect(() => {
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (isReduced) => {
      reducedRef.current = isReduced;
    });

    void AccessibilityInfo.isReduceMotionEnabled().then((isReduced) => {
      reducedRef.current = isReduced;
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    rendererRef.current?.configure({ levels: () => levelsRef.current?.(), style: auraStyle, gap, glideMs });
  }, [auraStyle, gap, glideMs]);

  useEffect(() => {
    rendererRef.current?.setState(state);

    if (state !== "hidden") {
      wakeRef.current?.();
    }
  }, [state]);

  useEffect(
    () => () => {
      wakeRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    },
    [],
  );

  const handleLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  const handleContextCreate = (context: ExpoWebGLRenderingContext): void => {
    const gl = context as unknown as WebGLRenderingContext;
    let renderer: IAuraRenderer;

    try {
      renderer = createAuraRenderer(gl, {
        settings: { levels: () => levelsRef.current?.(), style: auraStyle, gap, glideMs },
        background: latestRef.current.mode,
        effects: "shader",
        isAdditive: true,
        isReducedMotion: () => reducedRef.current,
      });
    } catch {
      return;
    }

    rendererRef.current = renderer;
    renderer.setState(state);
    const budget = createFrameBudget();
    let frame = 0;
    let restUntil = 0;

    const host: IAuraHost = {
      background: () => latestRef.current.mode,
      target: () => rectOf(latestRef.current.outline, latestRef.current.size),
      place: () => {
        const current = latestRef.current.size;

        if (current.width < 1 || current.height < 1) {
          return null;
        }

        return {
          x: 0,
          y: 0,
          width: current.width,
          height: current.height,
          pixelWidth: context.drawingBufferWidth,
          pixelHeight: context.drawingBufferHeight,
          clip: clipOf(latestRef.current.outline, current),
        };
      },
      hide: () => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, context.drawingBufferWidth, context.drawingBufferHeight);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      },
    };

    const tick = (now: number): void => {
      frame = 0;

      if (rendererRef.current !== renderer) {
        return;
      }

      if (now < restUntil) {
        frame = requestAnimationFrame(tick);
        return;
      }

      const started = performance.now();
      const isRunning = renderer.frame(now, host);
      context.endFrameEXP();
      restUntil = now + budget.record(performance.now() - started);
      renderer.setQuality(budget.quality);

      if (isRunning) {
        frame = requestAnimationFrame(tick);
      }
    };

    wakeRef.current = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(tick);
      }
    };

    wakeRef.current();
  };

  if (expoGl === null) {
    return null;
  }

  const { GLView } = expoGl;

  return (
    <GLView
      style={[styles.fill, style]}
      msaaSamples={0}
      pointerEvents="none"
      onLayout={handleLayout}
      onContextCreate={handleContextCreate}
    />
  );
}

const styles = StyleSheet.create({
  fill: {
    backgroundColor: "transparent",
  },
});
