// The read-aloud player that docks above the composer. It follows one
// speech session: "Preparing audio…", then the sentence being read with the
// current word, a sentence-by-sentence progress track, skip, speed, jump to
// the current word, and close. It hides itself 30 s after playback ends.

import { icon } from "./icons.js";
import { createMiniWave } from "./miniWave.js";

const RATES = [1, 1.25, 1.5, 2, 0.75];
const HIDE_AFTER_MS = 30_000;

const clock = (s, round = false) => {
  const whole = Math.max(0, round ? Math.round(s) : Math.floor(s));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

const PLAY_LABEL = {
  preparing: ["pause", "Stop"],
  playing: ["pause", "Pause"],
  paused: ["play", "Resume"],
  ended: ["replay", "Replay"],
  error: ["replay", "Retry"],
};

export function createPlayer(root, { levels, colors, onLocate, onClose }) {
  root.innerHTML = `
    <div class="pl-main">
      <button type="button" class="pl-btn pl-play" id="pl-play"></button>
      <canvas class="pl-wave" aria-hidden="true"></canvas>
      <div class="pl-now">
        <span class="pl-kind" hidden></span>
        <div class="pl-window"><div class="pl-line"></div></div>
      </div>
      <div class="pl-tools">
        <button type="button" class="pl-btn" id="pl-prev" aria-label="Previous sentence" title="Previous sentence (←)">${icon("prev", 16)}</button>
        <button type="button" class="pl-btn" id="pl-next" aria-label="Next sentence" title="Next sentence (→)">${icon("next", 16)}</button>
        <button type="button" class="pl-rate" id="pl-rate" aria-label="Playback speed 1×" title="Playback speed">1×</button>
        <span class="pl-time" id="pl-time">0:00 / 0:00</span>
        <button type="button" class="pl-btn pl-hide-narrow" id="pl-locate" aria-label="Show the current word" title="Show the current word">${icon("locate", 16)}</button>
        <button type="button" class="pl-btn" id="pl-close" aria-label="Stop and close" title="Stop (Esc)">${icon("close", 16)}</button>
      </div>
    </div>
    <div class="pl-track" id="pl-track" role="group" aria-label="Sentences"></div>`;

  const q = (sel) => root.querySelector(sel);
  const playBtn = q("#pl-play");
  const prevBtn = q("#pl-prev");
  const nextBtn = q("#pl-next");
  const rateBtn = q("#pl-rate");
  const timeEl = q("#pl-time");
  const track = q("#pl-track");
  const line = q(".pl-line");
  const windowEl = q(".pl-window");
  const kind = q(".pl-kind");
  const wave = createMiniWave(q(".pl-wave"), { levels, colors });

  let speech = null;
  let msg = null;
  let segs = [];
  let shownSentence = -1;
  let filled = -1;
  let hideTimer = 0;
  let closeTimer = 0;

  function setLine(text) {
    shownSentence = -1;
    line.replaceChildren(text);
    line.style.transform = "translateX(0)";
    kind.hidden = true;
  }

  function buildTrack() {
    segs = msg.sentences.map((s, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = s.kind === "block" ? "pl-seg is-block" : "pl-seg";
      b.style.flexGrow = String(Math.max(0.5, s.end - s.start).toFixed(2));
      const name = s.label || `Sentence ${i + 1}`;
      b.setAttribute("aria-label", `${name}: ${s.text}`);
      b.title = s.label ? `${s.label}: ${s.text}` : s.text;
      const fill = document.createElement("span");
      fill.className = "pl-fill";
      b.append(fill);
      b.addEventListener("click", () => speech?.seek(s.start + 0.01));
      return { b, fill, s };
    });
    track.replaceChildren(...segs.map((x) => x.b));
    filled = -1;
  }

  function onTick() {
    if (!speech?.session || !msg) return;
    const t = speech.time;
    const ended = speech.session.phase === "ended";
    const k = ended ? segs.length : speech.sentenceAt(t);
    if (k !== filled) {
      segs.forEach((x, i) => {
        x.fill.style.transform = `scaleX(${i < k ? 1 : 0})`;
        x.b.classList.toggle("is-now", i === k);
      });
      filled = k;
    }
    const cur = segs[k];
    if (cur) {
      const f = (t - cur.s.start) / Math.max(0.01, cur.s.end - cur.s.start);
      cur.fill.style.transform = `scaleX(${Math.min(1, Math.max(0, f)).toFixed(3)})`;
    }
    timeEl.textContent = `${clock(t)} / ${clock(msg.duration, true)}`;
  }

  function onCue() {
    const s = speech?.session;
    if (!s || !msg || s.cue < 0 || s.phase === "ended") return;
    const cue = msg.cues[s.cue];
    const k = msg.sentences.findIndex((x) => x.seg === cue.seg && cue.tok >= x.from && cue.tok <= x.to);
    if (k < 0) return;
    const sentence = msg.sentences[k];
    if (k !== shownSentence) {
      shownSentence = k;
      const tokens = msg.segments[sentence.seg].tokens.slice(sentence.from, sentence.to + 1);
      line.replaceChildren(
        ...tokens.flatMap((tok, j) => {
          const span = document.createElement("span");
          span.className = "pl-w";
          span.textContent = tok.text;
          return j ? [" ", span] : [span];
        }),
      );
      kind.hidden = !sentence.label;
      kind.textContent = sentence.label;
      line.style.transform = "translateX(0)";
    }
    const index = cue.tok - sentence.from;
    const words = line.querySelectorAll(".pl-w");
    words.forEach((w, j) => {
      w.classList.toggle("is-now", j === index);
      w.classList.toggle("is-past", j < index);
    });
    const now = words[index];
    if (now) {
      const over = now.offsetLeft + now.offsetWidth - windowEl.clientWidth * 0.72;
      line.style.transform = `translateX(${-Math.max(0, over).toFixed(1)}px)`;
    }
    onTick();
  }

  function render() {
    const s = speech?.session;
    const phase = s && s.msg === msg ? s.phase : "idle";
    if (phase === "idle") return close();
    show();
    root.dataset.phase = phase;
    clearTimeout(hideTimer);
    const [name, label] = PLAY_LABEL[phase];
    playBtn.innerHTML = phase === "preparing" ? `<span class="spinner"></span>` : icon(name);
    playBtn.setAttribute("aria-label", label);
    playBtn.title = `${label} (Space)`;
    prevBtn.disabled = nextBtn.disabled = phase === "preparing" || phase === "error";
    if (phase === "preparing") setLine("Preparing audio…");
    if (phase === "ended") {
      setLine(`Finished · ${clock(msg.duration, true)}`);
      hideTimer = setTimeout(() => onClose?.(), HIDE_AFTER_MS);
    }
    if (phase === "error") setLine(s.error || "Speech failed.");
    if (phase === "playing" && shownSentence < 0) onCue();
    wave.setState(phase === "playing" ? "live" : phase === "preparing" ? "working" : "still");
    onTick();
  }

  function show() {
    clearTimeout(closeTimer);
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add("is-open"));
    wave.start();
  }

  function close() {
    clearTimeout(hideTimer);
    root.classList.remove("is-open");
    root.dataset.phase = "idle";
    wave.stop();
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      if (!root.classList.contains("is-open")) root.hidden = true;
    }, 240);
  }

  playBtn.addEventListener("click", () => {
    if (speech?.session?.phase === "preparing") onClose?.();
    else speech?.toggle();
  });
  prevBtn.addEventListener("click", () => speech?.prev());
  nextBtn.addEventListener("click", () => speech?.next());
  rateBtn.addEventListener("click", () => {
    const r = RATES[(RATES.indexOf(speech?.rate ?? 1) + 1) % RATES.length];
    speech?.setRate(r);
    rateBtn.textContent = `${r}×`;
    rateBtn.setAttribute("aria-label", `Playback speed ${r}×`);
  });
  q("#pl-locate").addEventListener("click", () => onLocate?.());
  q("#pl-close").addEventListener("click", () => onClose?.());

  return {
    bind(next) {
      speech = next;
      speech.addEventListener("phase", render);
      speech.addEventListener("cue", onCue);
      speech.addEventListener("tick", onTick);
    },
    open(next) {
      msg = next;
      clearTimeout(hideTimer);
      buildTrack();
      setLine("Preparing audio…");
      show();
    },
    setColors(next) {
      wave.setColors(next);
    },
  };
}
