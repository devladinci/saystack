import type { ISpeechChunk, ISpeechPosition } from "@saystack/core";
import { alignWords, tokenizeWords } from "@saystack/core";

import { DEFAULT_BLOCKS, scanPage } from "./scanPage.js";
import type { IPage } from "./scanPage.js";

export interface IReadAlongSeek {
  chunkIndex: number;
  seconds: number;
}

export interface IReadAlongOptions {
  blocks?: string;
  isDimmed?: boolean;
  onSeek?: (target: IReadAlongSeek) => void;
}

export interface IReadAlong {
  setChunks(chunks: readonly ISpeechChunk[]): void;
  setPosition(position: ISpeechPosition): void;
  setDimmed(isDimmed: boolean): void;
  finish(): void;
  clear(): void;
  destroy(): void;
}

interface ISpoken {
  chunkIndex: number;
  wordIndex: number;
}

interface IAlignment {
  spoken: ISpoken[];
  chunkStarts: number[];
  pageOf: number[];
  blockOf: (Element | null)[];
}

export const READ_HIGHLIGHT = "saystack-read";

export const UNREAD_HIGHLIGHT = "saystack-unread";

const PILL_PADDING_X = 4;

const PILL_PADDING_Y = 1;

const highlightRegistry = (): HighlightRegistry | null =>
  typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined" ? CSS.highlights : null;

const overlay = (className: string): HTMLDivElement => {
  const element = document.createElement("div");
  element.className = className;
  element.setAttribute("aria-hidden", "true");
  element.style.position = "fixed";
  element.style.left = "0";
  element.style.top = "0";
  element.style.pointerEvents = "none";
  element.style.opacity = "0";

  return element;
};

const scrollParent = (element: Element): Element | null => {
  for (let node = element.parentElement; node !== null; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);

    if (overflowY === "auto" || overflowY === "scroll") {
      return node;
    }
  }

  return null;
};

const caretAt = (x: number, y: number): { node: Node; offset: number } | null => {
  if (typeof document.caretPositionFromPoint === "function") {
    const caret = document.caretPositionFromPoint(x, y);

    return caret === null ? null : { node: caret.offsetNode, offset: caret.offset };
  }

  if (typeof document.caretRangeFromPoint === "function") {
    const range = document.caretRangeFromPoint(x, y);

    return range === null ? null : { node: range.startContainer, offset: range.startOffset };
  }

  return null;
};

function align(chunks: readonly ISpeechChunk[], page: IPage): IAlignment {
  const spoken: ISpoken[] = [];
  const chunkStarts: number[] = [];
  const texts: string[] = [];

  chunks.forEach((chunk, chunkIndex) => {
    chunkStarts.push(spoken.length);
    tokenizeWords(chunk.text).forEach((token, wordIndex) => {
      spoken.push({ chunkIndex, wordIndex });
      texts.push(token.text);
    });
  });

  const pageOf = alignWords(
    texts,
    page.words.map((word) => word.text),
  );
  const blockOf = pageOf.map((match, index): Element | null => {
    if (match >= 0) {
      return null;
    }

    let before = index - 1;

    while (before >= 0 && (pageOf[before] ?? -1) < 0) {
      before -= 1;
    }

    let after = index + 1;

    while (after < pageOf.length && (pageOf[after] ?? -1) < 0) {
      after += 1;
    }

    const from = before >= 0 ? (pageOf[before] ?? -1) + 1 : 0;
    const to = after < pageOf.length ? (pageOf[after] ?? page.words.length) : page.words.length;

    return page.blocks.find((block) => block.after >= from && block.after <= to)?.element ?? null;
  });

  return { spoken, chunkStarts, pageOf, blockOf };
}

export function createReadAlong(root: Element, options: IReadAlongOptions = {}): IReadAlong {
  const blocks = options.blocks ?? DEFAULT_BLOCKS;
  const onSeek = options.onSeek;
  let isDimmed = options.isDimmed ?? true;
  let page: IPage = scanPage(root, blocks);
  let chunks: readonly ISpeechChunk[] = [];
  let alignment: IAlignment = align(chunks, page);
  let isStale = false;
  let current = -1;
  let block: Element | null = null;
  let isActive = false;
  let repositionFrame = 0;
  let painted: { read: Highlight; unread: Highlight } | null = null;
  const clipper = scrollParent(root);
  const pill = overlay("saystack-read-along-word");
  const ring = overlay("saystack-read-along-block");
  document.body.append(pill, ring);

  const paintHighlights = (readBefore: number): void => {
    const registry = highlightRegistry();

    if (registry === null) {
      return;
    }

    const read = new Highlight();
    const unread = new Highlight();

    page.words.forEach((word, index) => {
      if (index < readBefore) {
        read.add(word.range);
      } else if (isDimmed && index !== current) {
        unread.add(word.range);
      }
    });

    registry.set(READ_HIGHLIGHT, read);
    registry.set(UNREAD_HIGHLIGHT, unread);
    painted = { read, unread };
  };

  const place = (element: HTMLDivElement, box: DOMRect | null, padX: number, padY: number): void => {
    const bounds = clipper?.getBoundingClientRect();
    const isVisible =
      box !== null &&
      box.width > 0 &&
      (bounds === undefined || (box.bottom > bounds.top && box.top < bounds.bottom));

    if (!isVisible || box === null) {
      element.style.opacity = "0";
      return;
    }

    element.style.opacity = "1";
    element.style.transform = `translate(${(box.left - padX).toFixed(1)}px, ${(box.top - padY).toFixed(1)}px)`;
    element.style.width = `${(box.width + padX * 2).toFixed(1)}px`;
    element.style.height = `${(box.height + padY * 2).toFixed(1)}px`;
  };

  const reposition = (): void => {
    repositionFrame = 0;

    if (!isActive) {
      return;
    }

    const word = page.words[current];
    place(pill, block === null && word !== undefined ? word.range.getBoundingClientRect() : null, PILL_PADDING_X, PILL_PADDING_Y);
    place(ring, block?.getBoundingClientRect() ?? null, 6, 6);
  };

  const scheduleReposition = (): void => {
    if (repositionFrame === 0) {
      repositionFrame = requestAnimationFrame(reposition);
    }
  };

  const refresh = (): void => {
    page = scanPage(root, blocks);
    alignment = align(chunks, page);
    isStale = false;
  };

  const observer = new MutationObserver(() => {
    isStale = true;
  });
  observer.observe(root, { childList: true, characterData: true, subtree: true });

  const activate = (): void => {
    if (isActive) {
      return;
    }

    isActive = true;
    window.addEventListener("scroll", scheduleReposition, { capture: true, passive: true });
    window.addEventListener("resize", scheduleReposition);
  };

  const clear = (): void => {
    isActive = false;
    current = -1;
    block = null;
    pill.style.opacity = "0";
    ring.style.opacity = "0";
    window.removeEventListener("scroll", scheduleReposition, { capture: true });
    window.removeEventListener("resize", scheduleReposition);

    const registry = highlightRegistry();

    if (registry !== null && painted !== null) {
      if (registry.get(READ_HIGHLIGHT) === painted.read) {
        registry.delete(READ_HIGHLIGHT);
      }

      if (registry.get(UNREAD_HIGHLIGHT) === painted.unread) {
        registry.delete(UNREAD_HIGHLIGHT);
      }
    }

    painted = null;
  };

  const handleClick = (event: Event): void => {
    if (onSeek === undefined || !isActive || !(event instanceof MouseEvent)) {
      return;
    }

    if (document.getSelection()?.isCollapsed === false) {
      return;
    }

    const caret = caretAt(event.clientX, event.clientY);
    const pageIndex =
      caret === null ? -1 : page.words.findIndex((word) => word.range.comparePoint(caret.node, caret.offset) === 0);
    const clickedBlock = event.target instanceof Element ? page.blocks.find((item) => item.element.contains(event.target as Node)) : undefined;
    const spokenIndex =
      pageIndex >= 0
        ? alignment.pageOf.indexOf(pageIndex)
        : alignment.blockOf.findIndex((element) => clickedBlock !== undefined && element === clickedBlock.element);
    const target = alignment.spoken[spokenIndex];

    if (target === undefined) {
      return;
    }

    const seconds = chunks[target.chunkIndex]?.words[target.wordIndex]?.start ?? 0;
    onSeek({ chunkIndex: target.chunkIndex, seconds });
  };

  root.addEventListener("click", handleClick);

  return {
    setChunks(next) {
      const isSameSpeech =
        next.length === chunks.length && next.every((chunk, index) => chunk.text === chunks[index]?.text);
      chunks = next;

      if (isStale || !isSameSpeech) {
        refresh();
      }
    },
    setPosition(position) {
      if (isStale) {
        refresh();
      }

      const start = alignment.chunkStarts[position.chunkIndex];

      if (start === undefined || position.wordIndex < 0) {
        return;
      }

      activate();
      const spokenIndex = start + position.wordIndex;
      let pageIndex = alignment.pageOf[spokenIndex] ?? -1;
      block = pageIndex < 0 ? (alignment.blockOf[spokenIndex] ?? null) : null;

      for (let back = spokenIndex - 1; pageIndex < 0 && back >= 0; back -= 1) {
        pageIndex = alignment.pageOf[back] ?? -1;
      }

      if (pageIndex !== current || block !== null) {
        current = pageIndex;
        paintHighlights(block === null ? pageIndex : pageIndex + 1);
      }

      reposition();
    },
    setDimmed(next) {
      isDimmed = next;

      if (isActive) {
        paintHighlights(current);
      }
    },
    finish() {
      block = null;
      current = -1;
      pill.style.opacity = "0";
      ring.style.opacity = "0";
      paintHighlights(page.words.length);
    },
    clear,
    destroy() {
      clear();
      cancelAnimationFrame(repositionFrame);
      observer.disconnect();
      root.removeEventListener("click", handleClick);
      pill.remove();
      ring.remove();
    },
  };
}
