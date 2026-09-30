export interface IStreamingInput {
  begin(base?: string): void;
  update(finalText: string, interimText: string): string;
  end(): string;
  cancel(): string;
  destroy(): void;
}

interface IShownWord {
  text: string;
  isFinal: boolean;
  bornAt: number;
}

const ENTER_MS = 520;

const COPIED_STYLES = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontStretch",
  "lineHeight",
  "letterSpacing",
  "wordSpacing",
  "textIndent",
  "textAlign",
  "textTransform",
  "direction",
  "tabSize",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
] as const;

const splitWords = (text: string): string[] => text.trim().split(/\s+/).filter(Boolean);

const joinText = (base: string, words: readonly string[]): string => {
  const spoken = words.join(" ");

  if (base === "" || spoken === "") {
    return `${base}${spoken}`;
  }

  return /\s$/.test(base) ? `${base}${spoken}` : `${base} ${spoken}`;
};

export function createStreamingInput(field: HTMLTextAreaElement | HTMLInputElement): IStreamingInput {
  const mirror = document.createElement("div");
  mirror.className = "saystack-streaming";
  mirror.setAttribute("aria-hidden", "true");
  mirror.style.position = "fixed";
  mirror.style.left = "0";
  mirror.style.top = "0";
  mirror.style.pointerEvents = "none";
  mirror.style.overflow = "hidden";
  mirror.style.boxSizing = "border-box";
  mirror.style.borderStyle = "solid";
  mirror.style.borderColor = "transparent";
  mirror.style.whiteSpace = field instanceof HTMLTextAreaElement ? "pre-wrap" : "pre";
  mirror.style.overflowWrap = "break-word";

  let base = "";
  let shown: IShownWord[] = [];
  let isStreaming = false;
  let savedColor = "";
  let savedCaret = "";
  let frame = 0;

  const follow = (): void => {
    frame = 0;

    if (!isStreaming) {
      return;
    }

    const box = field.getBoundingClientRect();
    const computed = getComputedStyle(field);

    for (const property of COPIED_STYLES) {
      mirror.style[property] = computed[property];
    }

    mirror.style.transform = `translate(${box.left}px, ${box.top}px)`;
    mirror.style.width = `${box.width}px`;
    mirror.style.height = `${box.height}px`;
    mirror.scrollTop = field.scrollTop;
    mirror.scrollLeft = field.scrollLeft;
  };

  const scheduleFollow = (): void => {
    if (frame === 0) {
      frame = requestAnimationFrame(follow);
    }
  };

  const render = (next: readonly IShownWord[]): void => {
    const now = performance.now();
    const content = document.createDocumentFragment();

    if (base !== "") {
      content.append(/\s$/.test(base) || next.length === 0 ? base : `${base} `);
    }

    next.forEach((word, index) => {
      if (index > 0) {
        content.append(" ");
      }

      const span = document.createElement("span");
      span.className = word.isFinal ? "saystack-streaming-word" : "saystack-streaming-word saystack-streaming-interim";
      span.textContent = word.text;
      const age = now - word.bornAt;

      if (age < ENTER_MS) {
        span.classList.add("saystack-streaming-new");
        span.style.animationDelay = `${-age}ms`;
      }

      content.append(span);
    });

    const caret = document.createElement("span");
    caret.className = "saystack-streaming-caret";
    content.append(caret);
    mirror.replaceChildren(content);
  };

  const stopStreaming = (): void => {
    isStreaming = false;
    shown = [];
    mirror.replaceChildren();
    mirror.remove();
    field.style.color = savedColor;
    field.style.caretColor = savedCaret;
    window.removeEventListener("scroll", scheduleFollow, { capture: true });
    window.removeEventListener("resize", scheduleFollow);
    field.removeEventListener("scroll", scheduleFollow);
  };

  return {
    begin(from) {
      if (isStreaming) {
        return;
      }

      isStreaming = true;
      base = from ?? field.value;
      shown = [];
      mirror.style.color = getComputedStyle(field).color;
      savedColor = field.style.color;
      savedCaret = field.style.caretColor;
      field.style.color = "transparent";
      field.style.caretColor = "transparent";
      document.body.append(mirror);
      window.addEventListener("scroll", scheduleFollow, { capture: true, passive: true });
      window.addEventListener("resize", scheduleFollow);
      field.addEventListener("scroll", scheduleFollow, { passive: true });
      render([]);
      follow();
    },
    update(finalText, interimText) {
      const words = [
        ...splitWords(finalText).map((text) => ({ text, isFinal: true })),
        ...splitWords(interimText).map((text) => ({ text, isFinal: false })),
      ];
      const now = performance.now();
      const next = words.map((word, index): IShownWord => {
        const previous = shown[index];

        return { ...word, bornAt: previous !== undefined && previous.text === word.text ? previous.bornAt : now };
      });

      shown = next;

      if (isStreaming) {
        render(next);
        scheduleFollow();
      }

      return joinText(
        base,
        words.map((word) => word.text),
      );
    },
    end() {
      const text = joinText(
        base,
        shown.map((word) => word.text),
      );
      stopStreaming();

      return text;
    },
    cancel() {
      const text = base;
      stopStreaming();

      return text;
    },
    destroy() {
      cancelAnimationFrame(frame);

      if (isStreaming) {
        stopStreaming();
      }
    },
  };
}
