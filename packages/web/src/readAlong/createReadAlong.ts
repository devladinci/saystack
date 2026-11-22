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
  // The marks float above the page by default; set this to tuck them under the app's own layers.
  zIndex?: number;
  // Scrolls the word being read back into view when it leaves it, until the reader scrolls by hand. On by default.
  follow?: boolean;
  onSeek?: (target: IReadAlongSeek) => void;
}

export interface IReadAlong {
  setChunks(chunks: readonly ISpeechChunk[]): void;
  setPosition(position: ISpeechPosition): void;
  setDimmed(isDimmed: boolean): void;
  // Brings the word being read into view and follows it again.
  locate(): void;
  finish(): void;
  clear(): void;
  destroy(): void;
}

// Dispatched on the root by whoever wants the word being read in view, such as a player's locate button.
// It is cancelled when a read-along answers it.
export const LOCATE_EVENT = "saystack-locate";

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

const RING_PADDING = 6;

const ROOT_CLASS = "saystack-read-along";

// On a root whose words can be clicked to move the reading there.
const SEEKABLE_CLASS = "saystack-read-along-seekable";

// How far the unread words have dimmed, from 0 to 1. Registered in the stylesheet, so it can be animated.
const FADE_PROPERTY = "--saystack-unread-fade";

const FADE_MS = 300;

// The share of the visible height kept clear above and below the word being read.
const FOLLOW_EDGE = 0.2;

const FOLLOW_REST = 0.32;

const FOLLOW_PAUSE_MS = 400;

const SCROLL_KEYS: readonly string[] = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "];

interface IMark {
  element: HTMLDivElement;
  isShown: boolean;
  top: number;
}

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const withoutTransition = (element: HTMLElement, change: () => void): void => {
  element.style.transition = "none";
  change();
  void element.offsetWidth;
  element.style.transition = "";
};

const highlightRegistry = (): HighlightRegistry | null =>
  typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined" ? CSS.highlights : null;

const overlay = (className: string, zIndex: number | undefined): HTMLDivElement => {
  const element = document.createElement("div");
  element.className = className;

  if (zIndex !== undefined) {
    element.style.zIndex = String(zIndex);
  }

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

// How many read-alongs hold a root: one that is fading out must not undo what the next one has set up.
const holders = new WeakMap<Element, number>();

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
  let shownBlock: Element | null = null;
  let isActive = false;
  let repositionFrame = 0;
  let painted: { read: Highlight; unread: Highlight } | null = null;
  let isFollowing = options.follow ?? true;
  let followedAt = -Infinity;
  let fade: Animation | null = null;
  let unpaintTimer: ReturnType<typeof setTimeout> | undefined;
  const clipper = scrollParent(root);
  const pill: IMark = { element: overlay("saystack-read-along-word", options.zIndex), isShown: false, top: 0 };
  const ring: IMark = { element: overlay("saystack-read-along-block", options.zIndex), isShown: false, top: 0 };
  document.body.append(pill.element, ring.element);
  root.classList.add(ROOT_CLASS);
  root.classList.toggle(SEEKABLE_CLASS, onSeek !== undefined);
  holders.set(root, (holders.get(root) ?? 0) + 1);

  // The unread words dim and come back gradually: the highlight reads this property off the root.
  const fadeTo = (target: 0 | 1): void => {
    if (!(root instanceof HTMLElement)) {
      return;
    }

    const from = getComputedStyle(root).getPropertyValue(FADE_PROPERTY).trim();
    fade?.cancel();
    fade = null;
    root.style.setProperty(FADE_PROPERTY, String(target));

    if (from === "" || from === String(target) || typeof root.animate !== "function" || prefersReducedMotion()) {
      return;
    }

    fade = root.animate([{ [FADE_PROPERTY]: from }, { [FADE_PROPERTY]: String(target) }], {
      duration: FADE_MS,
      easing: "ease",
    });
  };

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

  const hide = (mark: IMark): void => {
    mark.element.style.opacity = "0";
    mark.isShown = false;
  };

  // A mark glides from word to word along a line. Anywhere else it takes its new place at once: when it was
  // hidden, when the page moved under it, and when the next word is on another line, where it fades in rather
  // than streak across the text.
  const place = (mark: IMark, box: DOMRect | null, padX: number, padY: number, isInstant: boolean): void => {
    const bounds = clipper?.getBoundingClientRect();
    const isVisible =
      box !== null && box.width > 0 && (bounds === undefined || (box.bottom > bounds.top && box.top < bounds.bottom));

    if (!isVisible || box === null) {
      hide(mark);
      return;
    }

    const { element } = mark;
    const apply = (): void => {
      element.style.transform = `translate(${(box.left - padX).toFixed(1)}px, ${(box.top - padY).toFixed(1)}px)`;
      element.style.width = `${(box.width + padX * 2).toFixed(1)}px`;
      element.style.height = `${(box.height + padY * 2).toFixed(1)}px`;
    };
    const isOnAnotherLine = Math.abs(box.top - mark.top) > box.height * 0.6;

    if (!mark.isShown || (!isInstant && isOnAnotherLine)) {
      withoutTransition(element, () => {
        apply();
        element.style.opacity = "0";
      });
    } else if (isInstant) {
      withoutTransition(element, apply);
    } else {
      apply();
    }

    element.style.opacity = "1";
    mark.isShown = true;
    mark.top = box.top;
  };

  const placeMarks = (isInstant: boolean): void => {
    const word = page.words[current];
    place(
      pill,
      block === null && word !== undefined ? word.range.getBoundingClientRect() : null,
      PILL_PADDING_X,
      PILL_PADDING_Y,
      isInstant,
    );
    place(ring, block?.getBoundingClientRect() ?? null, RING_PADDING, RING_PADDING, isInstant);
  };

  const reposition = (): void => {
    repositionFrame = 0;

    if (isActive) {
      placeMarks(true);
    }
  };

  const spot = (): DOMRect | null =>
    block?.getBoundingClientRect() ?? page.words[current]?.range.getBoundingClientRect() ?? null;

  const scrollTo = (box: DOMRect, isForced: boolean): void => {
    const bounds = clipper?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    const edge = Math.min(120, bounds.height * FOLLOW_EDGE);
    const isInView =
      box.top >= bounds.top + edge && Math.min(box.bottom, box.top + bounds.height / 2) <= bounds.bottom - edge;
    const now = performance.now();

    if (!isForced && (isInView || now - followedAt < FOLLOW_PAUSE_MS)) {
      return;
    }

    const scroller = clipper ?? window;
    followedAt = now;

    if (typeof scroller.scrollBy === "function") {
      scroller.scrollBy({
        top: box.top - bounds.top - bounds.height * FOLLOW_REST,
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    }
  };

  const follow = (): void => {
    const box = spot();

    if (isFollowing && box !== null) {
      scrollTo(box, false);
    }
  };

  // Scrolling by hand means the reader wants to look elsewhere; the page stops following until asked to.
  const handleScrollIntent = (event: Event): void => {
    if (!(event instanceof KeyboardEvent) || SCROLL_KEYS.includes(event.key)) {
      isFollowing = false;
    }
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
    isFollowing = options.follow ?? true;
    clearTimeout(unpaintTimer);
    fadeTo(1);
    window.addEventListener("scroll", scheduleReposition, { capture: true, passive: true });
    window.addEventListener("resize", scheduleReposition);
    window.addEventListener("wheel", handleScrollIntent, { capture: true, passive: true });
    window.addEventListener("touchmove", handleScrollIntent, { capture: true, passive: true });
    window.addEventListener("keydown", handleScrollIntent, { capture: true });
  };

  const unpaint = (): void => {
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

  const deactivate = (): void => {
    isActive = false;
    current = -1;
    block = null;
    shownBlock = null;
    hide(pill);
    hide(ring);
    window.removeEventListener("scroll", scheduleReposition, { capture: true });
    window.removeEventListener("resize", scheduleReposition);
    window.removeEventListener("wheel", handleScrollIntent, { capture: true });
    window.removeEventListener("touchmove", handleScrollIntent, { capture: true });
    window.removeEventListener("keydown", handleScrollIntent, { capture: true });
  };

  const isDimming = (): boolean => isActive && painted !== null && painted.unread.size > 0;

  // The unread words keep their dimming until it has faded out, so stopping does not snap them back.
  const clear = (): void => {
    const wasDimming = isDimming();
    deactivate();
    fadeTo(0);
    clearTimeout(unpaintTimer);

    if (wasDimming && fade !== null) {
      unpaintTimer = setTimeout(unpaint, FADE_MS);
    } else {
      unpaint();
    }
  };

  const locate = (): void => {
    const box = spot();
    isFollowing = options.follow ?? true;

    if (isActive && box !== null) {
      scrollTo(box, true);
    }
  };

  const handleLocate = (event: Event): void => {
    if (isActive && spot() !== null) {
      event.preventDefault();
      locate();
    }
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
    const clickedBlock =
      event.target instanceof Element
        ? page.blocks.find((item) => item.element.contains(event.target as Node))
        : undefined;
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
  root.addEventListener(LOCATE_EVENT, handleLocate);

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

      if (pageIndex === current && block === shownBlock) {
        return;
      }

      current = pageIndex;
      shownBlock = block;
      paintHighlights(block === null ? pageIndex : pageIndex + 1);
      placeMarks(false);
      follow();
    },
    setDimmed(next) {
      isDimmed = next;

      if (isActive) {
        paintHighlights(current);
      }
    },
    locate,
    finish() {
      block = null;
      shownBlock = null;
      current = -1;
      hide(pill);
      hide(ring);
      paintHighlights(page.words.length);
    },
    clear,
    destroy() {
      const wasDimming = isDimming();
      deactivate();
      clearTimeout(unpaintTimer);
      cancelAnimationFrame(repositionFrame);
      observer.disconnect();
      root.removeEventListener("click", handleClick);
      root.removeEventListener(LOCATE_EVENT, handleLocate);

      const leave = (): void => {
        const left = (holders.get(root) ?? 1) - 1;
        holders.set(root, left);
        unpaint();
        fade?.cancel();
        pill.element.remove();
        ring.element.remove();

        if (left === 0) {
          root.classList.remove(ROOT_CLASS, SEEKABLE_CLASS);

          if (root instanceof HTMLElement) {
            root.style.removeProperty(FADE_PROPERTY);
          }
        }
      };

      // Dimmed words fade back before the highlight is taken away; with nothing dimmed it goes at once.
      if (wasDimming && holders.get(root) === 1) {
        fadeTo(0);
      }

      if (wasDimming && fade !== null) {
        setTimeout(leave, FADE_MS);
      } else {
        leave();
      }
    },
  };
}
