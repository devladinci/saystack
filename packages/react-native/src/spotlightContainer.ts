import type { ComponentType, ReactNode } from "react";

// Where a spotlight mounts: in place by default, or a full-window host such as react-native-screens' FullWindowOverlay.
export type SpotlightContainer = ComponentType<{ children: ReactNode }>;
