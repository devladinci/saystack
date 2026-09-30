import type { ISpeechChunk } from "@saystack/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createReadAlong, READ_HIGHLIGHT, UNREAD_HIGHLIGHT } from "../src/readAlong/createReadAlong.js";
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

  it("removes its overlays when destroyed", () => {
    const readAlong = createReadAlong(mount("<p>Bye.</p>"));

    readAlong.destroy();

    expect(document.querySelector(".saystack-read-along-word")).toBeNull();
    expect(document.querySelector(".saystack-read-along-block")).toBeNull();
  });
});
