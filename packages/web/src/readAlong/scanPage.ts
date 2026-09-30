export interface IPageWord {
  text: string;
  range: Range;
}

export interface IPageBlock {
  element: Element;
  after: number;
}

export interface IPage {
  words: IPageWord[];
  blocks: IPageBlock[];
}

export const DEFAULT_BLOCKS = "pre, table, figure, img, svg, video, canvas, [data-read-as-block]";

const SKIPPED = "script, style, template, [aria-hidden='true'], [data-read-along-skip]";

const WORD_BREAKS =
  "p, div, li, ul, ol, dl, dt, dd, h1, h2, h3, h4, h5, h6, blockquote, section, article, header, footer, aside, nav, tr, td, th, caption, figcaption, details, summary";

interface IOpenWord {
  word: IPageWord;
  container: Element | null;
}

// The page itself is never modified: words are live ranges over its text nodes.
export function scanPage(root: Element, blocks: string = DEFAULT_BLOCKS): IPage {
  const words: IPageWord[] = [];
  const found: IPageBlock[] = [];
  let open: IOpenWord | null = null;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!(node instanceof Element)) {
        return NodeFilter.FILTER_ACCEPT;
      }

      if (node.matches(SKIPPED)) {
        return NodeFilter.FILTER_REJECT;
      }

      if (node !== root && node.matches(blocks)) {
        found.push({ element: node, after: words.length });
        open = null;
        return NodeFilter.FILTER_REJECT;
      }

      if (node.tagName === "BR") {
        open = null;
      }

      return NodeFilter.FILTER_SKIP;
    },
  });

  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (!(node instanceof Text)) {
      continue;
    }

    const text = node.data;
    const container = node.parentElement?.closest(WORD_BREAKS) ?? null;

    if (open !== null && (open as IOpenWord).container !== container) {
      open = null;
    }

    for (const match of text.matchAll(/\S+|\s+/g)) {
      const piece = match[0];
      const start = match.index;

      if (/^\s/.test(piece)) {
        open = null;
        continue;
      }

      const current: IOpenWord | null = open;

      if (current !== null && start === 0) {
        current.word.text += piece;
        current.word.range.setEnd(node, start + piece.length);
        continue;
      }

      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + piece.length);
      const word: IPageWord = { text: piece, range };
      words.push(word);
      open = { word, container };
    }
  }

  return { words, blocks: found };
}
