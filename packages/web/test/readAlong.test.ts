import type { ISpeechChunk } from "@saystack/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createReadAlong, LOCATE_EVENT, READ_HIGHLIGHT, UNREAD_HIGHLIGHT } from "../src/readAlong/createReadAlong.js";
import { scanPage } from "../src/readAlong/scanPage.js";

class FakeHighlight extends Set<Range> {}

const registry = new Map<string, FakeHighlight>();

const chunk = (text: string): ISpeechChunk => ({ text, words: [], duration: 0 });

const mount = (html: string): HTMLElement => {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);

  return root;
};

const highlighted = (name: string): string[] => Array.from(registry.get(name) ?? [], (range) => range.toString());

type Box = [x: number, y: number, width: number, height: number];

// Gives each word a place on screen: the test environment lays nothing out.
const layout = (boxes: Record<string, Box>) =>
  vi.spyOn(Range.prototype, "getBoundingClientRect").mockImplementation(function (this: Range) {
    const box = boxes[this.toString()];

    return box === undefined ? new DOMRect() : new DOMRect(...box);
  });

const mountInScroller = (html: string) => {
  const scroller = document.createElement("div");
  const scrollBy = vi.fn();

  scroller.style.overflowY = "auto";
  scroller.scrollBy = scrollBy;
  scroller.innerHTML = `<div>${html}</div>`;
  document.body.append(scroller);
  vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 400, 300));

  return { root: scroller.firstElementChild as HTMLElement, scrollBy };
};

const pillElement = (): HTMLElement => document.querySelector(".saystack-read-along-word") as HTMLElement;

// A mark that takes its place at once does so with its transition off, which takes a forced layout.
const jumpsOf = (mark: HTMLElement) => vi.spyOn(mark, "offsetWidth", "get").mockReturnValue(0);

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

const at = (wordIndex: number) => ({ chunkIndex: 0, time: 0, duration: 1, wordIndex });

beforeEach(() => {
  registry.clear();
  vi.stubGlobal("Highlight", FakeHighlight);
  vi.stubGlobal("CSS", { highlights: registry });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("scanPage", () => {
  it("finds words in reading order and keeps inline markup inside one word", () => {
    const root = mount("<p>Make it <strong>bold</strong>, then <em>go</em>.</p>");

    expect(scanPage(root).words.map((word) => word.text)).toEqual(["Make", "it", "bold,", "then", "go."]);
  });

  it("does not glue words across paragraphs", () => {
    const root = mount("<p>end</p><p>Start</p>");

    expect(scanPage(root).words.map((word) => word.text)).toEqual(["end", "Start"]);
  });

  it("records code, tables and images as blocks and skips their text", () => {
    const root = mount("<p>Before</p><pre>x = 1</pre><table><tr><td>cell</td></tr></table><p>After</p>");
    const page = scanPage(root);

    expect(page.words.map((word) => word.text)).toEqual(["Before", "After"]);
    expect(page.blocks.map((block) => [block.element.tagName, block.after])).toEqual([
      ["PRE", 1],
      ["TABLE", 1],
    ]);
  });

  it("never changes the page", () => {
    const html = "<p>Keep <b>this</b> exactly</p>";
    const root = mount(html);

    scanPage(root);

    expect(root.innerHTML).toBe(html);
  });
});

describe("createReadAlong", () => {
  it("marks the words already read and dims the rest", () => {
    const root = mount("<p>One two three four.</p>");
    const readAlong = createReadAlong(root);

    readAlong.setChunks([chunk("One two three four.")]);
    readAlong.setPosition({ chunkIndex: 0, time: 0, duration: 1, wordIndex: 2 });

    expect(highlighted(READ_HIGHLIGHT)).toEqual(["One", "two"]);
    expect(highlighted(UNREAD_HIGHLIGHT)).toEqual(["four."]);
  });

  it("follows speech split into several chunks", () => {
    const root = mount("<p>One two.</p><p>Three four.</p>");
    const readAlong = createReadAlong(root);

    readAlong.setChunks([chunk("One two."), chunk("Three four.")]);
    readAlong.setPosition({ chunkIndex: 1, time: 0, duration: 1, wordIndex: 1 });

    expect(highlighted(READ_HIGHLIGHT)).toEqual(["One", "two.", "Three"]);
  });

  it("lights a block while its announcement is spoken", () => {
    const root = mount("<p>Look at this.</p><pre>x = 1</pre><p>Then carry on.</p>");
    const pre = root.querySelector("pre");
    vi.spyOn(pre as HTMLPreElement, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 20, 200, 40));
    const readAlong = createReadAlong(root);

    readAlong.setChunks([chunk("Look at this. Code block, skipped. Then carry on.")]);
    readAlong.setPosition({ chunkIndex: 0, time: 0, duration: 1, wordIndex: 3 });

    const ring = document.querySelector<HTMLElement>(".saystack-read-along-block");

    expect(ring?.style.opacity).toBe("1");
    expect(highlighted(READ_HIGHLIGHT)).toEqual(["Look", "at", "this."]);
  });

  it("leaves everything marked read when speech finishes, and clears on request", () => {
    const root = mount("<p>One two.</p>");
    const readAlong = createReadAlong(root);

    readAlong.setChunks([chunk("One two.")]);
    readAlong.setPosition({ chunkIndex: 0, time: 0, duration: 1, wordIndex: 0 });
    readAlong.finish();

    expect(highlighted(READ_HIGHLIGHT)).toEqual(["One", "two."]);

    readAlong.clear();

    expect(registry.has(READ_HIGHLIGHT)).toBe(false);
  });

  it("does not clear highlights another read-along painted", () => {
    const first = createReadAlong(mount("<p>First message.</p>"));
    const second = createReadAlong(mount("<p>Second message.</p>"));

    first.setChunks([chunk("First message.")]);
    first.setPosition({ chunkIndex: 0, time: 0, duration: 1, wordIndex: 1 });
    second.setChunks([chunk("Second message.")]);
    second.setPosition({ chunkIndex: 0, time: 0, duration: 1, wordIndex: 1 });
    first.clear();

    expect(highlighted(READ_HIGHLIGHT)).toEqual(["Second"]);
  });

  it("does not jump when a click only ends a text selection", () => {
    const root = mount("<p>Copy these words.</p>");
    const onSeek = vi.fn();
    const readAlong = createReadAlong(root, { onSeek });
    vi.spyOn(document, "getSelection").mockReturnValue({ isCollapsed: false } as Selection);

    readAlong.setChunks([chunk("Copy these words.")]);
    readAlong.setPosition({ chunkIndex: 0, time: 0, duration: 1, wordIndex: 0 });
    root.querySelector("p")?.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 5, clientY: 5 }));

    expect(onSeek).not.toHaveBeenCalled();
  });

  it("puts the pill on the word being read", () => {
    const root = mount("<p>One two.</p>");
    layout({ One: [10, 20, 30, 18], "two.": [50, 20, 30, 18] });
    const readAlong = createReadAlong(root);

    readAlong.setChunks([chunk("One two.")]);
    readAlong.setPosition(at(1));

    const pill = pillElement();

    expect(pill.style.opacity).toBe("1");
    expect(pill.style.transform).toBe("translate(46.0px, 19.0px)");
    expect(pill.style.width).toBe("38px");
    expect(pill.style.height).toBe("20px");
  });

  it("glides along a line, and takes its place at once when it appears and on a new line", () => {
    const root = mount("<p>One two three.</p>");
    layout({ One: [10, 20, 30, 18], two: [50, 20, 30, 18], "three.": [10, 44, 40, 18] });
    const readAlong = createReadAlong(root);
    const jumps = jumpsOf(pillElement());

    readAlong.setChunks([chunk("One two three.")]);
    readAlong.setPosition(at(0));
    expect(jumps).toHaveBeenCalledTimes(1);

    readAlong.setPosition(at(1));
    expect(jumps).toHaveBeenCalledTimes(1);

    readAlong.setPosition(at(2));
    expect(jumps).toHaveBeenCalledTimes(2);
    expect(pillElement().style.opacity).toBe("1");
  });

  it("stays on its word when the page scrolls under it", async () => {
    const root = mount("<p>One two.</p>");
    const boxes: Record<string, Box> = { One: [10, 200, 30, 18] };
    layout(boxes);
    const readAlong = createReadAlong(root);
    const jumps = jumpsOf(pillElement());

    readAlong.setChunks([chunk("One two.")]);
    readAlong.setPosition(at(0));
    boxes.One = [10, 120, 30, 18];
    window.dispatchEvent(new Event("scroll"));
    await nextFrame();

    expect(pillElement().style.transform).toBe("translate(6.0px, 119.0px)");
    expect(jumps).toHaveBeenCalledTimes(2);
  });

  it("hides the pill while its word is scrolled out of the message's scroller", () => {
    const { root } = mountInScroller("<p>One two.</p>");
    layout({ One: [10, 20, 30, 18], "two.": [10, 420, 30, 18] });
    const readAlong = createReadAlong(root, { follow: false });

    readAlong.setChunks([chunk("One two.")]);
    readAlong.setPosition(at(0));
    expect(pillElement().style.opacity).toBe("1");

    readAlong.setPosition(at(1));
    expect(pillElement().style.opacity).toBe("0");
  });

  it("scrolls the word being read back into view", () => {
    const { root, scrollBy } = mountInScroller("<p>One two.</p>");
    layout({ One: [10, 100, 30, 18], "two.": [10, 420, 30, 18] });
    const readAlong = createReadAlong(root);

    readAlong.setChunks([chunk("One two.")]);
    readAlong.setPosition(at(0));
    expect(scrollBy).not.toHaveBeenCalled();

    readAlong.setPosition(at(1));
    expect(scrollBy).toHaveBeenCalledWith({ top: 324, behavior: "smooth" });
  });

  it("does not scroll again before the last scroll has had time to arrive", () => {
    const { root, scrollBy } = mountInScroller("<p>One two three.</p>");
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    layout({ One: [10, 420, 30, 18], two: [50, 420, 30, 18], "three.": [90, 420, 30, 18] });
    const readAlong = createReadAlong(root);

    readAlong.setChunks([chunk("One two three.")]);
    readAlong.setPosition(at(0));
    now.mockReturnValue(1200);
    readAlong.setPosition(at(1));
    expect(scrollBy).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1500);
    readAlong.setPosition(at(2));
    expect(scrollBy).toHaveBeenCalledTimes(2);
  });

  it("stops following once the reader scrolls by hand, until asked to locate the word", () => {
    const { root, scrollBy } = mountInScroller("<p>One two.</p>");
    layout({ One: [10, 100, 30, 18], "two.": [10, 420, 30, 18] });
    const readAlong = createReadAlong(root);

    readAlong.setChunks([chunk("One two.")]);
    readAlong.setPosition(at(0));
    window.dispatchEvent(new Event("wheel"));
    readAlong.setPosition(at(1));
    expect(scrollBy).not.toHaveBeenCalled();

    readAlong.locate();
    expect(scrollBy).toHaveBeenCalledTimes(1);
  });

  it("keeps following through keys that do not scroll", () => {
    const { root, scrollBy } = mountInScroller("<p>One two.</p>");
    layout({ One: [10, 100, 30, 18], "two.": [10, 420, 30, 18] });
    const readAlong = createReadAlong(root);

    readAlong.setChunks([chunk("One two.")]);
    readAlong.setPosition(at(0));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    readAlong.setPosition(at(1));

    expect(scrollBy).toHaveBeenCalledTimes(1);
  });

  it("never scrolls when told not to follow", () => {
    const { root, scrollBy } = mountInScroller("<p>One two.</p>");
    layout({ One: [10, 100, 30, 18], "two.": [10, 420, 30, 18] });
    const readAlong = createReadAlong(root, { follow: false });

    readAlong.setChunks([chunk("One two.")]);
    readAlong.setPosition(at(1));

    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("answers a locate request while it reads, and leaves it to others when it does not", () => {
    const { root, scrollBy } = mountInScroller("<p>One two.</p>");
    layout({ One: [10, 100, 30, 18], "two.": [50, 100, 30, 18] });
    const readAlong = createReadAlong(root);
    const ask = (): boolean => !root.dispatchEvent(new CustomEvent(LOCATE_EVENT, { cancelable: true }));

    expect(ask()).toBe(false);

    readAlong.setChunks([chunk("One two.")]);
    readAlong.setPosition(at(0));

    expect(ask()).toBe(true);
    expect(scrollBy).toHaveBeenCalledTimes(1);

    readAlong.clear();

    expect(ask()).toBe(false);
  });

  it("shows that its words can be clicked only when a click does something", () => {
    const plain = mount("<p>One.</p>");
    const seekable = mount("<p>Two.</p>");
    const first = createReadAlong(plain);
    const second = createReadAlong(seekable, { onSeek: vi.fn() });

    expect(plain.classList.contains("saystack-read-along-seekable")).toBe(false);
    expect(seekable.classList.contains("saystack-read-along-seekable")).toBe(true);

    first.destroy();
    second.destroy();

    expect(seekable.className).toBe("");
  });

  it("fades the dimming in and out, and keeps the highlight until it has faded", () => {
    vi.useFakeTimers();
    const root = mount("<p>One two three.</p>");
    const animate = vi.fn(() => ({ cancel: vi.fn() }));
    root.animate = animate as unknown as HTMLElement["animate"];
    root.style.setProperty("--saystack-unread-fade", "0");
    const readAlong = createReadAlong(root);

    readAlong.setChunks([chunk("One two three.")]);
    readAlong.setPosition(at(0));

    expect(root.style.getPropertyValue("--saystack-unread-fade")).toBe("1");
    expect(animate).toHaveBeenLastCalledWith([{ "--saystack-unread-fade": "0" }, { "--saystack-unread-fade": "1" }], {
      duration: 300,
      easing: "ease",
    });

    readAlong.clear();

    expect(root.style.getPropertyValue("--saystack-unread-fade")).toBe("0");
    expect(highlighted(UNREAD_HIGHLIGHT)).toEqual(["two", "three."]);

    vi.advanceTimersByTime(300);

    expect(registry.has(UNREAD_HIGHLIGHT)).toBe(false);
    vi.useRealTimers();
  });

  it("removes its overlays when destroyed", () => {
    const readAlong = createReadAlong(mount("<p>Bye.</p>"));

    readAlong.destroy();

    expect(document.querySelector(".saystack-read-along-word")).toBeNull();
    expect(document.querySelector(".saystack-read-along-block")).toBeNull();
  });
});
