import { holdOutcome, isPastCancel } from "@saystack/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

export interface IUseHoldToTalkOptions {
  onStart: () => void;
  onEnd: () => void;
  onCancel: () => void;
  cancelDistance?: number;
  minHoldMs?: number;
  isDisabled?: boolean;
}

export interface IHoldToTalkHandlers {
  onPointerDown: (event: ReactPointerEvent<Element>) => void;
  onPointerMove: (event: ReactPointerEvent<Element>) => void;
  onPointerUp: (event: ReactPointerEvent<Element>) => void;
  onPointerCancel: (event: ReactPointerEvent<Element>) => void;
}

export interface IHoldToTalk {
  isHolding: boolean;
  isCancelling: boolean;
  isTooShort: boolean;
  handlers: IHoldToTalkHandlers;
}

interface IPress {
  pointerId: number;
  x: number;
  y: number;
  at: number;
  isCancelling: boolean;
}

const TOO_SHORT_MS = 650;

// The web twin of react-native's useHoldToTalk: hold to talk, let go to finish, drag away first to
// cancel, and a tap is too short and says so. The pointer is captured, so a press that drifts off
// the button still ends on it.
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

  const handlers = useMemo((): IHoldToTalkHandlers => {
    const finish = (event: ReactPointerEvent<Element>, isTerminated: boolean): void => {
      const press = pressRef.current;

      if (press === null || press.pointerId !== event.pointerId) {
        return;
      }

      pressRef.current = null;
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
      onPointerDown: (event) => {
        if (latestRef.current.isDisabled || pressRef.current !== null || event.button !== 0) {
          return;
        }

        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);

        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
        }

        pressRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          at: Date.now(),
          isCancelling: false,
        };
        setIsHolding(true);
        setIsCancelling(false);
        setIsTooShort(false);
        latestRef.current.onStart();
      },
      onPointerMove: (event) => {
        const press = pressRef.current;

        if (press === null || press.pointerId !== event.pointerId) {
          return;
        }

        const next = isPastCancel(event.clientX - press.x, event.clientY - press.y, latestRef.current.cancelDistance);

        if (next !== press.isCancelling) {
          press.isCancelling = next;
          setIsCancelling(next);
        }
      },
      onPointerUp: (event) => finish(event, false),
      onPointerCancel: (event) => finish(event, true),
    };
  }, []);

  return { isHolding, isCancelling, isTooShort, handlers };
}
