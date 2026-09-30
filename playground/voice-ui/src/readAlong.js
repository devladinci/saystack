// Read-along for one message. Every word becomes a span. Code, tables and
// images are blocks that light up as a whole while their description is
// spoken. Timings arrive as word marks (char offset, length, seconds) against
// the spoken text of each segment, which is how TTS engines usually report
// word boundaries.

const BLOCKS = "pre, table, figure, img, .ss-block";
const TEXT = "p, li, h1, h2, h3, h4, h5, h6, dt, dd, blockquote";
const KIND_LABEL = { code: "Code", table: "Table", image: "Image", text: "" };

function kindOf(el) {
  if (el.dataset.kind) return el.dataset.kind;
  if (el.matches("pre")) return "code";
  if (el.matches("table")) return "table";
  return "image";
}

function wrapWords(el) {
  const words = [];
  let text = "";
  let open = false;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.tagName === "BR") {
        if (text && !text.endsWith(" ")) text += " ";
        open = false;
      }
      continue;
    }
    const frag = document.createDocumentFragment();
    for (const part of node.nodeValue.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        if (text && !text.endsWith(" ")) text += " ";
        open = false;
        frag.append(part);
        continue;
      }
      if (!open) {
        words.push({ start: text.length, end: text.length, pieces: [], order: 0 });
        open = true;
      }
      const word = words[words.length - 1];
      const span = document.createElement("span");
      span.className = "ss-word";
      span.textContent = part;
      word.pieces.push(span);
      text += part;
      word.end = text.length;
      frag.append(span);
    }
    node.replaceWith(frag);
  }
  return { text: text.trimEnd(), words };
}

/** Splits a message body into speakable segments and wraps its words. */
export function prepareMessage(root) {
  const segments = [];
  let order = 0;
  for (const el of root.querySelectorAll(`${BLOCKS}, ${TEXT}`)) {
    if (el.matches(BLOCKS)) {
      if (el.parentElement?.closest(BLOCKS)) continue;
      el.classList.add("ss-block");
      const kind = kindOf(el);
      segments.push({ kind: "block", el, label: KIND_LABEL[kind] ?? "Block", words: [], text: "", firstOrder: order });
      continue;
    }
    if (el.closest(BLOCKS) || el.querySelector(TEXT)) continue;
    const { text, words } = wrapWords(el);
    if (!words.length) continue;
    const index = segments.length;
    words.forEach((w, j) => {
      w.order = order++;
      for (const span of w.pieces) {
        span.dataset.s = String(index);
        span.dataset.w = String(j);
      }
    });
    segments.push({ kind: "text", el, label: "", words, text, firstOrder: words[0].order });
  }
  return segments;
}

const squash = (s) => s.replace(/\s+/g, " ").trim();

function tokenize(text) {
  const tokens = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(text))) tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length, t: NaN, word: -1 });
  return tokens;
}

/**
 * Attaches speech timings to the segments. Returns cues sorted by time,
 * one per spoken word: { t, seg, tok }.
 */
export function bindTiming(segments, timing) {
  if (timing.segments.length !== segments.length) {
    console.warn(`read-along: ${segments.length} segments on the page, ${timing.segments.length} in the timing`);
  }
  const cues = [];
  segments.forEach((seg, i) => {
    const spoken = timing.segments[i];
    if (!spoken) return;
    seg.start = spoken.start;
    seg.end = spoken.end;
    seg.spoken = spoken.text;
    seg.tokens = tokenize(spoken.text);
    for (const tok of seg.tokens) {
      const mark = spoken.marks.find(([c]) => c >= tok.start && c < tok.end);
      if (mark) tok.t = mark[2];
    }
    // Words the engine did not mark get a time between their neighbours.
    const toks = seg.tokens;
    for (let j = 0; j < toks.length; j++) {
      if (!Number.isNaN(toks[j].t)) continue;
      let a = j - 1;
      let b = j + 1;
      while (b < toks.length && Number.isNaN(toks[b].t)) b++;
      const ta = a >= 0 ? toks[a].t : seg.start;
      const ca = a >= 0 ? toks[a].start : 0;
      const tb = b < toks.length ? toks[b].t : seg.end;
      const cb = b < toks.length ? toks[b].start : spoken.text.length;
      toks[j].t = ta + ((tb - ta) * (toks[j].start - ca)) / Math.max(1, cb - ca);
    }
    for (let j = 1; j < toks.length; j++) toks[j].t = Math.max(toks[j].t, toks[j - 1].t);

    if (seg.kind === "text") {
      const same = squash(seg.text) === squash(spoken.text);
      if (!same) console.warn("read-along: page text differs from spoken text, matching by position", seg.el);
      toks.forEach((tok, j) => {
        tok.word = same
          ? j
          : Math.min(seg.words.length - 1, Math.floor((tok.start / spoken.text.length) * seg.words.length));
      });
    }
    toks.forEach((tok, j) => cues.push({ t: tok.t, seg: i, tok: j }));
  });
  return cues;
}

const SENTENCE_END = /[.!?]["')\]]*$/;

/** Sentences for the player: text segments split at full stops, blocks whole. */
export function sentencesOf(segments) {
  const out = [];
  segments.forEach((seg, i) => {
    if (!seg.tokens?.length) return;
    let from = 0;
    seg.tokens.forEach((tok, j) => {
      const last = j === seg.tokens.length - 1;
      if (seg.kind === "block" && !last) return;
      if (!last && !SENTENCE_END.test(tok.text)) return;
      out.push({
        seg: i,
        from,
        to: j,
        kind: seg.kind,
        label: seg.label,
        start: seg.tokens[from].t,
        text: seg.tokens.slice(from, j + 1).map((t) => t.text).join(" "),
      });
      from = j + 1;
    });
  });
  out.forEach((s, k) => {
    const next = out[k + 1];
    s.end = next && next.seg === s.seg ? next.start : segments[s.seg].end;
  });
  return out;
}

/** Moves one highlight pill across the words of a message as speech plays. */
export function createHighlighter(root, segments, { onSeek } = {}) {
  const pill = document.createElement("span");
  pill.className = "ss-pill";
  pill.setAttribute("aria-hidden", "true");
  root.append(pill);
  const words = segments.flatMap((s) => (s.kind === "text" ? s.words : []));
  let active = false;
  let current = null;
  let currentEl = null;
  let readBefore = -1;
  let lastTop = null;

  function place(word) {
    const base = root.getBoundingClientRect();
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const span of word.pieces) {
      const r = span.getBoundingClientRect();
      x0 = Math.min(x0, r.left);
      y0 = Math.min(y0, r.top);
      x1 = Math.max(x1, r.right);
      y1 = Math.max(y1, r.bottom);
    }
    const x = x0 - base.left - 4;
    const y = y0 - base.top - 1;
    const h = y1 - y0 + 2;
    const jump = lastTop === null || Math.abs(y - lastTop) > h * 0.5;
    if (jump) pill.style.transition = "none";
    pill.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    pill.style.width = `${(x1 - x0 + 8).toFixed(1)}px`;
    pill.style.height = `${h.toFixed(1)}px`;
    if (jump) {
      void pill.offsetWidth;
      pill.style.transition = "";
    }
    lastTop = y;
  }

  function paint(before, currentOrder) {
    for (const w of words) {
      const read = w.order < before;
      const now = w.order === currentOrder;
      for (const span of w.pieces) {
        span.classList.toggle("ss-read", read);
        span.classList.toggle("ss-current", now);
      }
    }
  }

  function set(segIndex, tokIndex) {
    const seg = segments[segIndex];
    if (!seg || (current && current.seg === segIndex && current.tok === tokIndex)) return;
    current = { seg: segIndex, tok: tokIndex };
    segments.forEach((s, i) => {
      if (s.kind !== "block") return;
      s.el.classList.toggle("ss-block-current", i === segIndex);
      s.el.classList.toggle("ss-read", i < segIndex);
    });
    let before;
    let currentOrder = -1;
    if (seg.kind === "text") {
      const word = seg.words[seg.tokens[tokIndex].word];
      before = word.order;
      currentOrder = word.order;
      currentEl = word.pieces[0];
      place(word);
      pill.classList.add("is-on");
    } else {
      before = seg.firstOrder;
      currentEl = seg.el;
      pill.classList.remove("is-on");
      lastTop = null;
    }
    if (before !== readBefore || currentOrder >= 0) paint(before, currentOrder);
    readBefore = before;
  }

  function clear() {
    active = false;
    current = null;
    currentEl = null;
    readBefore = -1;
    lastTop = null;
    root.classList.remove("ss-reading", "ss-dim", "ss-done");
    pill.classList.remove("is-on");
    paint(-1, -1);
    for (const s of segments) s.el.classList.remove("ss-block-current", "ss-read");
  }

  root.addEventListener("click", (e) => {
    if (!active) return;
    const span = e.target.closest(".ss-word");
    if (span && root.contains(span)) {
      const seg = segments[Number(span.dataset.s)];
      const word = Number(span.dataset.w);
      const tok = seg?.tokens?.findIndex((t) => t.word === word) ?? -1;
      if (tok >= 0) onSeek?.(Number(span.dataset.s), tok);
      return;
    }
    const block = e.target.closest(".ss-block");
    const index = segments.findIndex((s) => s.el === block);
    if (index >= 0) onSeek?.(index, 0);
  });

  new ResizeObserver(() => {
    if (!current) return;
    const seg = segments[current.seg];
    if (seg.kind === "text") {
      lastTop = null;
      place(seg.words[seg.tokens[current.tok].word]);
    }
  }).observe(root);

  return {
    activate({ dim = true } = {}) {
      clear();
      active = true;
      root.classList.add("ss-reading");
      root.classList.toggle("ss-dim", dim);
    },
    setDim(dim) {
      root.classList.toggle("ss-dim", dim && active);
    },
    set,
    /** Speech finished: everything counts as read, the pill fades out. */
    finish() {
      pill.classList.remove("is-on");
      root.classList.add("ss-done");
      paint(Infinity, -1);
      for (const s of segments) s.el.classList.remove("ss-block-current");
    },
    clear,
    get active() {
      return active;
    },
    currentElement() {
      return currentEl;
    },
  };
}
