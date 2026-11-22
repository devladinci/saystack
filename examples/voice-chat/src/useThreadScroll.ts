import { useEffect, useRef } from "react";

const MARGIN = 16;
const AT_END = 4;
// How long a scroll this hook started is given to arrive before the thread's position is trusted again.
const SETTLE_MS = 900;

const prefersReducedMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Keeps a chat thread where a reader expects it. What arrives comes into view: a short message whole, a long
// reply from its first line, so it can be read from the start. And a thread that is at its end stays at its
// end when the space around it changes, such as when the player opens under it.
export function useThreadScroll(thread: HTMLElement | null, arrival: unknown): void {
  const isAtEndRef = useRef(true);
  const settlesAtRef = useRef(0);
  const isFirstRef = useRef(true);

  useEffect(() => {
    if (thread === null) {
      return;
    }

    const toEnd = (): void => {
      isAtEndRef.current = true;
      settlesAtRef.current = performance.now() + SETTLE_MS;
      thread.scrollTo({ top: thread.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    };

    const handleScroll = (): void => {
      if (performance.now() > settlesAtRef.current) {
        isAtEndRef.current = thread.scrollHeight - thread.scrollTop - thread.clientHeight <= AT_END;
      }
    };

    // A scroll already on its way is aimed at the new end. A thread resting at its end moves with the space,
    // frame for frame, so its last line never leaves the edge while the composer or the player changes height.
    const resizes = new ResizeObserver(() => {
      if (!isAtEndRef.current) {
        return;
      }

      if (performance.now() < settlesAtRef.current) {
        toEnd();
      } else {
        thread.scrollTop = thread.scrollHeight;
      }
    });

    thread.addEventListener("scroll", handleScroll, { passive: true });
    resizes.observe(thread);

    return () => {
      thread.removeEventListener("scroll", handleScroll);
      resizes.disconnect();
    };
  }, [thread]);

  useEffect(() => {
    const newest = thread?.lastElementChild;

    if (thread === null || newest === null || newest === undefined) {
      return;
    }

    if (isFirstRef.current) {
      isFirstRef.current = false;
      return;
    }

    const view = thread.getBoundingClientRect();
    const box = newest.getBoundingClientRect();
    const isLong = box.height + MARGIN * 2 > view.height;

    isAtEndRef.current = !isLong;
    settlesAtRef.current = performance.now() + SETTLE_MS;
    thread.scrollTo({
      top: isLong ? thread.scrollTop + box.top - view.top - MARGIN : thread.scrollHeight,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [thread, arrival]);
}
