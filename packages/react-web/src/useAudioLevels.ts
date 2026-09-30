import type { IAudioLevels, IAudioLevelsOptions } from "@saystack/web";
import { createAudioLevels } from "@saystack/web";
import { useEffect, useState } from "react";

export function useAudioLevels({ bands, sensitivity, isAudible, fftSize, context }: IAudioLevelsOptions = {}): IAudioLevels | null {
  const [levels, setLevels] = useState<IAudioLevels | null>(null);

  useEffect(() => {
    if (context === undefined && typeof AudioContext === "undefined") {
      return;
    }

    const next = createAudioLevels({
      ...(isAudible === undefined ? {} : { isAudible }),
      ...(fftSize === undefined ? {} : { fftSize }),
      ...(context === undefined ? {} : { context }),
    });
    setLevels(next);

    return () => {
      next.dispose();
    };
  }, [isAudible, fftSize, context]);

  useEffect(() => {
    if (bands !== undefined) {
      levels?.setBands(bands);
    }
  }, [levels, bands]);

  useEffect(() => {
    if (sensitivity !== undefined) {
      levels?.setSensitivity(sensitivity);
    }
  }, [levels, sensitivity]);

  return levels;
}
