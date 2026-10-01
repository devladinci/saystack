import { useEffect, useState } from "react";

const TICK_MS = 250;

export function useElapsed(isRunning: boolean): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const startedAt = performance.now();
    const timer = setInterval(() => setSeconds(Math.floor((performance.now() - startedAt) / 1000)), TICK_MS);

    return () => {
      clearInterval(timer);
      setSeconds(0);
    };
  }, [isRunning]);

  return seconds;
}
