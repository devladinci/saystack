export type HoldOutcome = "end" | "cancel" | "tooShort";

export interface IHoldOutcomeInput {
  heldMs: number;
  isCancelling: boolean;
  minHoldMs: number;
}

export function holdOutcome({ heldMs, isCancelling, minHoldMs }: IHoldOutcomeInput): HoldOutcome {
  if (isCancelling) {
    return "cancel";
  }

  return heldMs < minHoldMs ? "tooShort" : "end";
}

export const isPastCancel = (dx: number, dy: number, cancelDistance: number): boolean =>
  Math.hypot(dx, dy) > cancelDistance;
