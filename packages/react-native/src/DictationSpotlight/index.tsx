import type { IAuraStyleOptions } from "@saystack/core";
import type { RefObject } from "react";
import { useEffect, useMemo, useState } from "react";
import type { ViewStyle } from "react-native";
import { Animated, StyleSheet, useWindowDimensions, View } from "react-native";

import { auraReach, TOP_WAVE_STYLE } from "../aura/auraGeometry.js";
import type { IHoldToTalk } from "../dictation/useHoldToTalk.js";
import type { INativeDictation } from "../dictation/useNativeDictation.js";
import type { IDictationLabels } from "../labels.js";
import { dictationLabels } from "../labels.js";
import LiveCaptions from "../LiveCaptions/index.js";
import type { IMeasurable } from "../measure.js";
import { measureInWindow } from "../measure.js";
import { Passthrough } from "../Passthrough.js";
import { SpotlightBackdrop } from "../SpotlightBackdrop.js";
import type { SpotlightContainer } from "../spotlightContainer.js";
import type { IVoiceTheme } from "../theme.js";
import { TopWave } from "../TopWave.js";
import type { DictationPhase } from "./useDictationPhase.js";
import { useDictationPhase } from "./useDictationPhase.js";
import { useDropMotion } from "./useDropMotion.js";
import { useElapsed } from "./useElapsed.js";

type Dictation = Pick<INativeDictation, "state" | "liveText" | "isStreaming" | "readLevels" | "errorCode" | "errorMessage">;

interface IProps {
  dictation: Dictation;
  theme: IVoiceTheme;
  hold?: Pick<IHoldToTalk, "isCancelling" | "isTooShort">;
  lifted?: RefObject<IMeasurable | null>;
  container?: SpotlightContainer;
  labels?: Partial<IDictationLabels>;
  auraStyle?: IAuraStyleOptions;
  blur?: number;
  dim?: number;
}

const UNMOUNT_MS = 360;

const AURA_STATE = { hidden: "hidden", listening: "active", working: "working", dropping: "hidden", notice: "hidden" } as const;

const clock = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

interface ICopy {
  text: string;
  placeholder: string;
  hint: string;
}

const copyFor = (phase: DictationPhase, dictation: Dictation, labels: IDictationLabels, isCancelling: boolean, isTooShort: boolean, seconds: number): ICopy => {
  if (phase === "notice") {
    const failure = dictation.errorCode === undefined ? undefined : labels.errors[dictation.errorCode];

    return { text: "", placeholder: isTooShort ? labels.holdToTalk : (failure ?? dictation.errorMessage ?? labels.failed), hint: "" };
  }

  if (phase !== "listening") {
    return { text: dictation.liveText, placeholder: labels.transcribing, hint: "" };
  }

  if (isCancelling) {
    return { text: dictation.liveText, placeholder: labels.listening, hint: labels.releaseToCancel };
  }

  return {
    text: dictation.liveText,
    placeholder: labels.listening,
    hint: dictation.isStreaming ? labels.releaseToInsert : `${clock(seconds)} · ${labels.releaseToSend}`,
  };
};

// Hold the mic: the chat blurs above the lifted composer, the aura hangs from the top edge and the words
// stream into the middle. On release they drop into the draft.
export default function DictationSpotlight({
  dictation,
  theme,
  hold,
  lifted,
  container: Container = Passthrough,
  labels,
  auraStyle = TOP_WAVE_STYLE,
  blur,
  dim,
}: IProps) {
  const isCancelling = hold?.isCancelling === true;
  const isTooShort = hold?.isTooShort === true;
  const phase = useDictationPhase(dictation.state, dictation.liveText !== "", isTooShort);
  const isOpen = phase !== "hidden";
  const isListening = phase === "listening";
  const [isMounted, setIsMounted] = useState(isOpen);
  const [sharpFrom, setSharpFrom] = useState<number | null>(null);
  const [take, setTake] = useState(0);
  const { height } = useWindowDimensions();
  const copy = useMemo(() => dictationLabels(labels), [labels]);
  const seconds = useElapsed(isListening && !dictation.isStreaming);
  const waveHeight = useMemo(() => auraReach(auraStyle, theme.mode, 0), [auraStyle, theme.mode]);
  const bottom = sharpFrom === null ? 0 : Math.max(0, height - sharpFrom);
  const drop = useDropMotion(phase === "dropping", Math.max(0, (height - bottom - waveHeight) / 2));
  const area = useMemo((): ViewStyle => ({ top: Math.max(waveHeight, 96), bottom: bottom + 24 }), [waveHeight, bottom]);

  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      return;
    }

    const timer = setTimeout(() => setIsMounted(false), UNMOUNT_MS);

    return () => clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isListening) {
      return;
    }

    let isCurrent = true;
    setTake((count) => count + 1);

    void measureInWindow(lifted?.current).then((rect) => {
      if (isCurrent) {
        setSharpFrom(rect?.y ?? null);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [isListening, lifted]);

  if (!isMounted) {
    return null;
  }

  const { text, placeholder, hint } = copyFor(phase, dictation, copy, isCancelling, isTooShort, seconds);

  return (
    <Container>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <SpotlightBackdrop isVisible={isOpen && phase !== "dropping"} theme={theme} bottom={bottom} {...(blur === undefined ? {} : { blur })} {...(dim === undefined ? {} : { dim })} />
        <TopWave state={AURA_STATE[phase]} mode={theme.mode} levels={dictation.readLevels} auraStyle={auraStyle} />
        <Animated.View style={[styles.area, area, drop]}>
          <LiveCaptions
            key={take}
            text={text}
            placeholder={placeholder}
            hint={hint}
            theme={theme}
            isCancelling={isCancelling}
            isWorking={phase === "working" && text === ""}
          />
        </Animated.View>
      </View>
    </Container>
  );
}

const styles = StyleSheet.create({
  area: {
    position: "absolute",
    left: 0,
    right: 0,
    justifyContent: "center",
  },
});
