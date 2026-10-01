import { useLayoutEffect, useRef, useState } from "react";

import type { ICaptionLayout } from "./captionSteps.js";
import { CAPTION_LINE_HEIGHT, CAPTION_STEPS, fitCaption } from "./captionSteps.js";

interface IProps {
  text: string;
  isListening: boolean;
  isDropping: boolean;
}

const FIRST_STEP: ICaptionLayout = { step: 0, isScrolling: false };

export function Captions({ text, isListening, isDropping }: IProps) {
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const [layout, setLayout] = useState(FIRST_STEP);
  const isIdle = text === "";

  useLayoutEffect(() => {
    const element = textRef.current;
    const fontSize = CAPTION_STEPS[layout.step]?.fontSize;

    if (element === null || fontSize === undefined) {
      return;
    }

    const next = fitCaption(layout.step, Math.round(element.scrollHeight / (fontSize * CAPTION_LINE_HEIGHT)));

    if (next.step !== layout.step || next.isScrolling !== layout.isScrolling) {
      setLayout(next);
    }
  }, [text, layout]);

  return (
    <div
      className="captions"
      data-step={layout.step}
      data-scrolling={layout.isScrolling}
      data-dropping={isDropping}
      aria-live="polite"
    >
      {isIdle ? (
        <p className="captions-idle">{isListening ? "Listening…" : "Transcribing…"}</p>
      ) : (
        <div className="captions-window">
          <p ref={textRef} className="captions-text">
            {text}
          </p>
        </div>
      )}
      {isListening ? <p className="captions-hint">Stop to add it to your message</p> : null}
    </div>
  );
}
