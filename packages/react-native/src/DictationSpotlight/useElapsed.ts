import { useEffect, useState } from "react";

export function useElapsed(isRunning: boolean): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const started = Date.now();
    setSeconds(0);
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 250);

    return () => clearInterval(timer);
  }, [isRunning]);

  return seconds;
}
