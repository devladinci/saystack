import { useEffect, useMemo, useRef, useState } from "react";
import type { GestureResponderEvent, GestureResponderHandlers } from "react-native";

import { holdOutcome, isPastCancel } from "@saystack/react";

export interface IUseHoldToTalkOptions {
  onStart: () => void;
  onEnd: () => void;
  onCancel: () => void;
  cancelDistance?: number;
  minHoldMs?: number;
  isDisabled?: boolean;
}

export type HoldToTalkHandlers = Pick<
  GestureResponderHandlers,
  | "onStartShouldSetResponder"
  | "onResponderGrant"
  | "onResponderMove"
  | "onResponderRelease"
  | "onResponderTerminate"
  | "onResponderTerminationRequest"
>;

export interface IHoldToTalk {
  isHolding: boolean;
  isCancelling: boolean;
  isTooShort: boolean;
  handlers: HoldToTalkHandlers;
}

interface IPress {
  x: number;
  y: number;
  at: number;
  isCancelling: boolean;
}

const TOO_SHORT_MS = 650;

// Hold to talk, let go to finish, slide away first to cancel. A tap is too short and says so.
export function useHoldToTalk({
  onStart,
  onEnd,
  onCancel,
  cancelDistance = 72,
  minHoldMs = 450,
  isDisabled = false,
}: IUseHoldToTalkOptions): IHoldToTalk {
  const [isHolding, setIsHolding] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isTooShort, setIsTooShort] = useState(false);
  const pressRef = useRef<IPress | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef({ onStart, onEnd, onCancel, cancelDistance, minHoldMs, isDisabled });

  useEffect(() => {
    latestRef.current = { onStart, onEnd, onCancel, cancelDistance, minHoldMs, isDisabled };
  });

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const handlers = useMemo((): HoldToTalkHandlers => {
    const finish = (isTerminated: boolean): void => {
      const press = pressRef.current;
      pressRef.current = null;

      if (press === null) {
        return;
      }

      setIsHolding(false);
      setIsCancelling(false);
      const latest = latestRef.current;
      const outcome = isTerminated
        ? "cancel"
        : holdOutcome({ heldMs: Date.now() - press.at, isCancelling: press.isCancelling, minHoldMs: latest.minHoldMs });

      if (outcome === "end") {
        latest.onEnd();
        return;
      }

      latest.onCancel();

      if (outcome === "tooShort") {
        setIsTooShort(true);
        timerRef.current = setTimeout(() => setIsTooShort(false), TOO_SHORT_MS);
      }
    };

    return {
      onStartShouldSetResponder: () => !latestRef.current.isDisabled,
      onResponderTerminationRequest: () => false,
      onResponderGrant: (event: GestureResponderEvent) => {
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
        }

        pressRef.current = {
          x: event.nativeEvent.pageX,
          y: event.nativeEvent.pageY,
          at: Date.now(),
          isCancelling: false,
        };
        setIsHolding(true);
        setIsCancelling(false);
        setIsTooShort(false);
        latestRef.current.onStart();
      },
      onResponderMove: (event: GestureResponderEvent) => {
        const press = pressRef.current;

        if (press === null) {
          return;
        }

        const next = isPastCancel(
          event.nativeEvent.pageX - press.x,
          event.nativeEvent.pageY - press.y,
          latestRef.current.cancelDistance,
        );

        if (next !== press.isCancelling) {
          press.isCancelling = next;
          setIsCancelling(next);
        }
      },
      onResponderRelease: () => finish(false),
      onResponderTerminate: () => finish(true),
    };
  }, []);

  return { isHolding, isCancelling, isTooShort, handlers };
}
