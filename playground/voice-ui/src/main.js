import { createAura } from "./aura.js";
import { bandEdges, createBandAnalyser, formatHz } from "./bands.js";
import { clipUrl } from "./clips.js";
import { micErrorText, startDemo, startMic } from "./dictation.js";
import { icon } from "./icons.js";
import { bandPalette } from "./palette.js";
import { createPlayer } from "./player.js";
import { bindTiming, createHighlighter, prepareMessage, sentencesOf } from "./readAlong.js";
import { createSpeech } from "./speech.js";
import { createStreamingInput } from "./streamInput.js";

const $ = (sel, root = document) => root.querySelector(sel);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

// The microphone only works when the page runs locally; inside a hosted
// preview it is refused, so the demo clip is the default there.
const host = location.hostname;
const LOCAL =
  location.protocol === "file:" ||
  ["localhost", "127.0.0.1", "[::1]"].includes(host) ||
  host.endsWith(".localhost");

const DEFAULTS = {
  theme: "system",
  bands: 7,
  layout: "flow",
  palette: "prism",
  height: 43,
  line: 1.8,
  aura: 0.75,
  glow: 12,
  gain: 0.55,
  speed: 0.35,
  quality: 1,
  sttSource: LOCAL ? "mic" : "demo",
  sttAnchor: "composer",
  sttPlacement: "top",
  sttOutline: "fade",
  sttBlur: 0,
  stream: true,
  autoSend: false,
  sensitivity: 1,
  ttsAnchor: "message",
  ttsPlacement: "top",
  ttsOutline: "full",
  ttsBlur: 6,
  dimUnread: true,
  follow: true,
  latency: true,
};

const PLACEMENTS = [
  ["top", "Top edge"],
  ["around", "All around"],
  ["bottom", "Bottom edge"],
];
const OUTLINES = [
  ["fade", "Fades out"],
  ["full", "Full"],
];
const blurLabel = (v) => (v === 0 ? "Crisp" : `${v} px`);

const CONTROLS = [
  {
    title: "Aura",
    items: [
      { key: "bands", label: "Bands", type: "segment", options: [[5, "5"], [6, "6"], [7, "7"], [8, "8"]] },
      {
        key: "layout",
        label: "Layout",
        type: "segment",
        options: [["mirror", "Mirrored"], ["linear", "Low → high"], ["flow", "Flow"]],
      },
      {
        key: "palette",
        label: "Colors",
        type: "segment",
        options: [["prism", "Prism"], ["aurora", "Aurora"], ["sunset", "Sunset"], ["mono", "Mono"]],
      },
      { key: "height", label: "Lift", type: "range", min: 6, max: 64, step: 1, format: (v) => `${v} px` },
      { key: "line", label: "Line width", type: "range", min: 1, max: 4, step: 0.1, format: (v) => `${v.toFixed(1)} px` },
      {
        key: "aura",
        label: "Aura",
        type: "range",
        min: 0,
        max: 2,
        step: 0.05,
        format: (v) => (v === 0 ? "Lines only" : v.toFixed(2)),
      },
      { key: "glow", label: "Aura size", type: "range", min: 4, max: 32, step: 1, format: (v) => `${v} px` },
      { key: "gain", label: "Brightness", type: "range", min: 0.4, max: 2, step: 0.05, format: (v) => v.toFixed(2) },
      { key: "speed", label: "Ripple speed", type: "range", min: 0, max: 2.5, step: 0.05, format: (v) => `${v.toFixed(2)}×` },
      { key: "quality", label: "Resolution", type: "segment", options: [[0.5, "Low"], [0.75, "Mid"], [1, "Full"]] },
    ],
  },
  {
    title: "Dictation",
    items: [
      { key: "sttSource", label: "Voice", type: "segment", options: [["mic", "Microphone"], ["demo", "Demo clip"]] },
      {
        key: "sttAnchor",
        label: "Anchor",
        type: "segment",
        options: [["composer", "Input"], ["mic", "Mic button"], ["page", "No anchor"]],
      },
      { key: "sttPlacement", label: "Bands sit on", type: "segment", options: PLACEMENTS },
      { key: "sttOutline", label: "Outline", type: "segment", options: OUTLINES },
      { key: "sttBlur", label: "Blur", type: "range", min: 0, max: 12, step: 0.5, format: blurLabel },
      { key: "stream", label: "Stream words into the input", type: "toggle" },
      { key: "autoSend", label: "Send when I stop", type: "toggle" },
      {
        key: "sensitivity",
        label: "Mic sensitivity",
        type: "range",
        min: 0.5,
        max: 2,
        step: 0.05,
        format: (v) => `${v.toFixed(2)}×`,
      },
    ],
  },
  {
    title: "Read aloud",
    items: [
      {
        key: "ttsAnchor",
        label: "Anchor",
        type: "select",
        options: [
          ["message", "The message"],
          ["block", "The paragraph or block being read"],
          ["chat", "The whole chat"],
          ["player", "The player"],
          ["page", "No anchor (page edges)"],
        ],
      },
      { key: "ttsPlacement", label: "Bands sit on", type: "segment", options: PLACEMENTS },
      { key: "ttsOutline", label: "Outline", type: "segment", options: OUTLINES },
      { key: "ttsBlur", label: "Blur", type: "range", min: 0, max: 12, step: 0.5, format: blurLabel },
      { key: "dimUnread", label: "Dim words not read yet", type: "toggle" },
      { key: "follow", label: "Scroll along with the voice", type: "toggle" },
      { key: "latency", label: "Wait 1.2 s for the first audio", type: "toggle" },
    ],
  },
];

// Per-anchor tweaks: how tall the waves are relative to the setting, and
// how far the glow sits from the element's edge.
const STT_ANCHORS = {
  composer: { scale: 1, padding: 0 },
  mic: { scale: 0.6, padding: 2 },
  page: { scale: 1, padding: 0 },
};
const TTS_ANCHORS = {
  message: { scale: 0.5, padding: 12, clip: true },
  block: { scale: 0.5, padding: 8, clip: true },
  chat: { scale: 0.6, padding: 0, inside: true },
  player: { scale: 0.5, padding: 0 },
  page: { scale: 0.9, padding: 0 },
};

const STORE_KEY = "saystack-voice-lab:v5";
function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveSettings() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  } catch {
    // storage is off; settings last for this visit only
  }
}
const settings = { ...DEFAULTS, ...loadSettings() };

const els = {
  scroll: $("#scroll"),
  thread: $("#thread"),
  composer: $("#composer"),
  input: $("#input"),
  mic: $("#mic"),
  timer: $("#mic-timer"),
  player: $("#player"),
  panel: $("#panel"),
  panelBody: $("#panel-body"),
  meters: $("#meters"),
  meterLabel: $("#meter-label"),
  toast: $("#toast"),
  note: $("#dock-note"),
  theme: $("#theme"),
  tune: $("#tune"),
  scrim: $("#scrim"),
  reset: $("#reset"),
};

// ---------------------------------------------------------------- audio --

let audio = null;
function ensureAudio() {
  if (!audio) {
    const context = new AudioContext();
    const stt = createBandAnalyser(context, { count: settings.bands, sensitivity: settings.sensitivity });
    const mute = context.createGain();
    mute.gain.value = 0;
    stt.node.connect(mute).connect(context.destination);
    const tts = createBandAnalyser(context, { count: settings.bands });
    const speech = createSpeech(context, tts);
    audio = { context, stt, tts, speech };
    player.bind(speech);
    speech.addEventListener("phase", onSpeechPhase);
    speech.addEventListener("cue", onSpeechCue);
  }
  audio.speech.unlock();
  audio.context.resume().catch(() => {});
  return audio;
}

// ---------------------------------------------------------------- auras --

const sttAura = createAura({ levels: () => audio?.stt.read() });
const ttsAura = createAura({ levels: () => audio?.tts.read() });

function auraLook() {
  return {
    bands: settings.bands,
    layout: settings.layout,
    palette: settings.palette,
    line: settings.line,
    aura: settings.aura,
    glow: settings.glow,
    gain: settings.gain,
    speed: settings.speed,
    quality: settings.quality,
  };
}

function applyAura() {
  const s = STT_ANCHORS[settings.sttAnchor];
  sttAura.setOptions({
    ...auraLook(),
    placement: settings.sttPlacement,
    outline: settings.sttOutline,
    blur: settings.sttBlur,
    height: settings.height * s.scale,
    padding: s.padding,
  });
  const t = TTS_ANCHORS[settings.ttsAnchor];
  ttsAura.setOptions({
    ...auraLook(),
    placement: settings.ttsPlacement,
    outline: settings.ttsOutline,
    blur: settings.ttsBlur,
    height: settings.height * t.scale,
    padding: t.padding,
    inside: !!t.inside,
    clip: t.clip ? els.scroll : null,
  });
}

function sttAnchorEl() {
  return { composer: els.composer, mic: els.mic, page: null }[settings.sttAnchor];
}

function ttsAnchorEl(rec, segIndex) {
  switch (settings.ttsAnchor) {
    case "block":
      return rec.segments[Math.max(0, segIndex)]?.el ?? rec.body;
    case "chat":
      return els.scroll;
    case "player":
      return els.player;
    case "page":
      return null;
    default:
      return rec.body;
  }
}

// --------------------------------------------------------------- player --

function uiColors() {
  const pal = bandPalette(settings.palette, settings.bands);
  return { dark: pal.css, light: pal.cssLight };
}

const player = createPlayer(els.player, {
  levels: () => audio?.tts.values,
  colors: uiColors(),
  onLocate: () => follow(true),
  onClose: () => audio?.speech.stop(),
});

// ------------------------------------------------------------ read aloud --

const messages = new Map();
let reading = null;
let cannedCount = 0;

function registerMessage(article) {
  const body = $(".body", article);
  const clip = article.dataset.clip;
  const rec = {
    id: article.id,
    el: article,
    body,
    clip,
    src: `assets/${clip}.m4a`,
    segments: prepareMessage(body),
    cues: null,
    sentences: null,
    duration: 0,
    loading: null,
    played: false,
  };
  rec.highlighter = createHighlighter(body, rec.segments, {
    onSeek: (seg, tok) => {
      if (audio?.speech.session?.msg === rec) audio.speech.seek(rec.segments[seg].tokens[tok].t);
    },
  });
  rec.speak = $(".speak", article);
  rec.speak.addEventListener("click", () => toggleReading(rec));
  $(".copy", article)?.addEventListener("click", (e) => copyMessage(rec, e.currentTarget));
  messages.set(rec.id, rec);
  return rec;
}

function loadTiming(rec) {
  if (!rec.loading) {
    rec.loading = fetch(`assets/${rec.clip}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((timing) => {
        rec.cues = bindTiming(rec.segments, timing);
        rec.sentences = sentencesOf(rec.segments);
        rec.duration = timing.duration;
      });
    rec.loading.catch(() => {
      rec.loading = null;
    });
  }
  return rec.loading;
}

function setSpeakUi(rec, state) {
  rec.speak.dataset.state = state;
  rec.speak.setAttribute("aria-pressed", String(state === "on"));
  const label = state === "on" ? "Pause" : state === "paused" ? "Resume" : "Read aloud";
  rec.speak.querySelector(".speak-label").textContent = label;
}

function toggleReading(rec) {
  const s = audio?.speech.session;
  if (s && s.msg === rec) {
    if (s.phase === "preparing") audio.speech.stop();
    else audio.speech.toggle();
    return;
  }
  startReading(rec);
}

async function startReading(rec) {
  const { speech, tts } = ensureAudio();
  if (dictation) await stopDictation({ cancel: true });
  if (reading && reading !== rec) {
    reading.highlighter.clear();
    setSpeakUi(reading, "off");
  }
  reading = rec;
  try {
    await loadTiming(rec);
  } catch (err) {
    toast(`The timing for this reply didn't load (${err.message}).`);
    return;
  }
  if (reading !== rec) return;
  tts.setCount(settings.bands);
  tts.reset();
  rec.highlighter.activate({ dim: settings.dimUnread });
  applyAura();
  ttsAura.setAnchor(ttsAnchorEl(rec, 0), { glide: false });
  player.open(rec);
  const latency = settings.latency && !rec.played ? 1200 : 0;
  rec.played = true;
  speech.start(rec, { latency });
}

function onSpeechPhase() {
  const s = audio.speech.session;
  const phase = s?.phase ?? "idle";
  ttsAura.setState({ preparing: "working", playing: "active", paused: "paused" }[phase] ?? "hidden");
  if (reading) setSpeakUi(reading, phase === "playing" || phase === "preparing" ? "on" : phase === "paused" ? "paused" : "off");
  if (phase === "ended") reading?.highlighter.finish();
  if (phase === "error" || phase === "idle") reading?.highlighter.clear();
  if (phase === "idle") reading = null;
  meterSource();
}

function onSpeechCue() {
  const s = audio.speech.session;
  if (!s || !reading || s.cue < 0 || s.msg !== reading) return;
  const cue = reading.cues[s.cue];
  reading.highlighter.set(cue.seg, cue.tok);
  if (settings.ttsAnchor === "block") ttsAura.setAnchor(ttsAnchorEl(reading, cue.seg));
  follow();
}

let manualScrollAt = -1e9;
for (const type of ["wheel", "touchmove"]) {
  els.scroll.addEventListener(type, () => (manualScrollAt = performance.now()), { passive: true });
}

function follow(force = false) {
  if (!reading) return;
  if (!force && (!settings.follow || performance.now() - manualScrollAt < 4000)) return;
  const el = reading.highlighter.currentElement() ?? reading.body;
  const r = el.getBoundingClientRect();
  const v = els.scroll.getBoundingClientRect();
  const inView = r.top >= v.top + v.height * 0.12 && r.bottom <= v.bottom - v.height * 0.22;
  if (!force && inView) return;
  const offset = r.height > v.height * 0.5 ? v.height * 0.1 : v.height * 0.3;
  els.scroll.scrollTo({
    top: els.scroll.scrollTop + r.top - v.top - offset,
    behavior: reducedMotion.matches ? "auto" : "smooth",
  });
  if (force) manualScrollAt = -1e9;
}

async function copyMessage(rec, button) {
  try {
    await navigator.clipboard.writeText(rec.body.innerText.trim());
    button.innerHTML = icon("check", 16);
    setTimeout(() => (button.innerHTML = icon("copy", 16)), 1400);
  } catch {
    toast("Copy isn't available here. Select the text instead.");
  }
}

// ------------------------------------------------------------- dictation --

let dictation = null;
let timerId = 0;
const DICTATION_CLIP = { src: "", timing: null };
const clipReady = Promise.all([
  fetch("assets/dictation.json").then((res) => res.json()),
  clipUrl("assets/dictation.m4a"),
])
  .then(([timing, url]) => Object.assign(DICTATION_CLIP, { timing, src: url }))
  .catch(() => null);

function autosize() {
  els.input.style.height = "auto";
  els.input.style.height = `${Math.min(els.input.scrollHeight, 168)}px`;
}

const stream = createStreamingInput(els.input, { onResize: autosize });

function setVoiceUi(state) {
  els.composer.dataset.voice = state;
  const listening = state === "listening";
  els.mic.setAttribute("aria-pressed", String(listening));
  els.mic.setAttribute(
    "aria-label",
    listening ? "Stop dictation" : state === "working" ? "Finishing dictation" : "Dictate",
  );
  els.mic.title = listening ? "Stop (M)" : "Dictate (M)";
  els.mic.innerHTML = state === "working" ? '<span class="spinner"></span>' : icon(listening ? "stop" : "mic");
  els.input.placeholder = listening ? "Listening…" : state === "working" ? "Finishing…" : "Message";
  clearInterval(timerId);
  els.timer.hidden = !listening;
  if (listening) {
    const t0 = performance.now();
    const tick = () => {
      const s = Math.floor((performance.now() - t0) / 1000);
      els.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    };
    tick();
    timerId = setInterval(tick, 250);
  }
  meterSource();
}

async function startDictation() {
  if (dictation) return;
  const a = ensureAudio();
  if (a.speech.session) a.speech.stop();
  a.stt.setCount(settings.bands);
  a.stt.setSensitivity(settings.sensitivity);
  a.stt.reset();
  applyAura();
  sttAura.setAnchor(sttAnchorEl(), { glide: false });
  sttAura.setState("active");

  const d = { latest: { final: "", interim: "" }, session: null, stopping: false, sendAfter: false };
  dictation = d;
  setVoiceUi("listening");
  if (settings.stream) stream.begin();

  const handlers = {
    onText(final, interim) {
      d.latest = { final, interim };
      if (dictation === d && stream.streaming) stream.update(final, interim);
    },
    onEnd() {
      if (dictation === d) stopDictation();
    },
    onError: toast,
  };
  const demo = async () => {
    await clipReady;
    if (!DICTATION_CLIP.timing) throw new Error("The demo clip didn't load.");
    return startDemo(a.context, a.stt, DICTATION_CLIP, handlers);
  };

  try {
    if (settings.sttSource === "mic") {
      try {
        d.session = await startMic(a.context, a.stt, { words: true, lang: navigator.language, ...handlers });
        if (!d.session.words) {
          toast("This browser has no speech recognition, so no words will appear. The aura still follows your voice.");
        }
      } catch (err) {
        if (dictation !== d) return;
        toast(`${micErrorText(err)} Playing the demo clip instead.`);
        d.session = await demo();
      }
    } else {
      d.session = await demo();
    }
    if (dictation !== d) d.session.cancel();
  } catch (err) {
    if (dictation !== d) return;
    toast(err?.message?.startsWith("The demo") ? err.message : "The demo clip didn't play.");
    stopDictation({ cancel: true });
  }
}

async function stopDictation({ cancel = false } = {}) {
  const d = dictation;
  if (!d || d.stopping) return;
  d.stopping = true;
  if (cancel) {
    d.session?.cancel();
    dictation = null;
    if (stream.streaming) stream.cancel();
    sttAura.setState("hidden");
    setVoiceUi("idle");
    return;
  }
  setVoiceUi("working");
  sttAura.setState("working");
  const began = performance.now();
  let text = "";
  try {
    text = (await d.session?.finish()) ?? "";
  } catch {
    text = "";
  }
  if (!text) text = [d.latest.final, d.latest.interim].filter(Boolean).join(" ");
  if (stream.streaming) stream.update(text, "");
  await wait(Math.max(0, 700 - (performance.now() - began)));
  if (dictation !== d) return;
  dictation = null;
  sttAura.setState("hidden");
  if (stream.streaming) stream.end();
  else if (text) insertText(text);
  setVoiceUi("idle");
  if ((settings.autoSend || d.sendAfter) && els.input.value.trim()) send();
  else els.input.focus({ preventScroll: true });
}

function toggleDictation() {
  if (dictation) stopDictation();
  else startDictation();
}

function insertText(text) {
  const before = els.input.value.trimEnd();
  els.input.value = before ? `${before} ${text}` : text;
  autosize();
}

// ------------------------------------------------------------------ chat --

function scrollToEnd() {
  els.scroll.scrollTo({ top: els.scroll.scrollHeight, behavior: reducedMotion.matches ? "auto" : "smooth" });
}

function appendUser(text) {
  const article = document.createElement("article");
  article.className = "msg user";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  article.append(bubble);
  els.thread.append(article);
  scrollToEnd();
}

function appendCanned() {
  const node = $("#tpl-canned").content.firstElementChild.cloneNode(true);
  node.id = `m-canned-${++cannedCount}`;
  els.thread.append(node);
  registerMessage(node);
  scrollToEnd();
}

function send() {
  if (dictation) {
    dictation.sendAfter = true;
    stopDictation();
    return;
  }
  const text = els.input.value.trim();
  if (!text) return;
  appendUser(text);
  els.input.value = "";
  autosize();
  if (/\b(read|aloud|out loud)\b/i.test(text)) {
    setTimeout(() => startReading(messages.get("m-reply")), 450);
  } else {
    setTimeout(appendCanned, 600);
  }
}

// ----------------------------------------------------------------- panel --

function isValid(item, v) {
  if (item.type === "segment" || item.type === "select") return item.options.some(([x]) => x === v);
  if (item.type === "range") return typeof v === "number" && v >= item.min && v <= item.max;
  if (item.type === "toggle") return typeof v === "boolean";
  return true;
}

function buildControl(item) {
  const id = `set-${item.key}`;
  const row = document.createElement("div");
  row.className = `p-row p-${item.type}`;
  if (!isValid(item, settings[item.key])) settings[item.key] = DEFAULTS[item.key];
  const value = settings[item.key];

  if (item.type === "segment") {
    row.innerHTML = `<span class="p-label" id="${id}-label">${item.label}</span><div class="seg" role="group" aria-labelledby="${id}-label"></div>`;
    const group = row.querySelector(".seg");
    for (const [v, label] of item.options) {
      const b = document.createElement("button");
      b.type = "button";
      b.id = `${id}-${String(v).replace(".", "_")}`;
      b.textContent = label;
      b.setAttribute("aria-pressed", String(v === value));
      b.addEventListener("click", () => {
        for (const other of group.children) other.setAttribute("aria-pressed", String(other === b));
        set(item.key, v);
      });
      group.append(b);
    }
  } else if (item.type === "range") {
    row.innerHTML = `<label class="p-label" for="${id}">${item.label}</label><output class="p-value" for="${id}"></output><input type="range" id="${id}" min="${item.min}" max="${item.max}" step="${item.step}">`;
    const input = row.querySelector("input");
    const out = row.querySelector("output");
    input.value = String(value);
    out.textContent = item.format(value);
    input.addEventListener("input", () => {
      const v = Number(input.value);
      out.textContent = item.format(v);
      set(item.key, v);
    });
  } else if (item.type === "toggle") {
    row.innerHTML = `<label class="p-switch" for="${id}"><span>${item.label}</span><input type="checkbox" id="${id}" role="switch"><span class="p-knob" aria-hidden="true"></span></label>`;
    const input = row.querySelector("input");
    input.checked = !!value;
    input.addEventListener("change", () => set(item.key, input.checked));
  } else if (item.type === "select") {
    row.innerHTML = `<label class="p-label" for="${id}">${item.label}</label><select id="${id}" class="p-select">${item.options
      .map(([v, label]) => `<option value="${v}">${label}</option>`)
      .join("")}</select>`;
    const select = row.querySelector("select");
    select.value = String(value);
    select.addEventListener("change", () => set(item.key, select.value));
  }
  return row;
}

function buildPanel() {
  const frag = document.createDocumentFragment();
  for (const section of CONTROLS) {
    const sec = document.createElement("section");
    sec.className = "p-section";
    const h = document.createElement("h2");
    h.className = "p-title";
    h.textContent = section.title;
    sec.append(h, ...section.items.map(buildControl));
    frag.append(sec);
  }
  els.panelBody.replaceChildren(frag);
}

function set(key, value) {
  settings[key] = value;
  saveSettings();
  if (key === "bands") {
    audio?.stt.setCount(value);
    audio?.tts.setCount(value);
  }
  if (key === "bands" || key === "palette") {
    player.setColors(uiColors());
    buildMeters();
  }
  if (key === "sensitivity") audio?.stt.setSensitivity(value);
  if (key === "dimUnread") reading?.highlighter.setDim(value);
  if (key === "sttSource") updateDockNote();
  if (key === "theme") applyTheme();
  applyAura();
  if (key === "sttAnchor" && dictation) sttAura.setAnchor(sttAnchorEl());
  if (key === "ttsAnchor" && reading && audio?.speech.session) {
    const cue = reading.cues?.[audio.speech.session.cue];
    ttsAura.setAnchor(ttsAnchorEl(reading, cue?.seg ?? 0));
  }
}

// ---------------------------------------------------------------- meters --

let meterBars = [];
let meterRunning = false;

function buildMeters() {
  const n = settings.bands;
  const edges = bandEdges(n);
  const pal = bandPalette(settings.palette, n);
  els.meters.style.setProperty("--bands", String(n));
  els.meters.replaceChildren(
    ...Array.from({ length: n }, (_, i) => {
      const m = document.createElement("div");
      m.className = "meter";
      m.title = `${formatHz(edges[i])}–${formatHz(edges[i + 1])} Hz`;
      m.innerHTML = `<div class="meter-track"><span class="meter-bar" style="--c-dark:${pal.css[i]};--c-light:${pal.cssLight[i]}"></span></div><span class="meter-hz">${formatHz(Math.sqrt(edges[i] * edges[i + 1]))}</span>`;
      return m;
    }),
  );
  meterBars = [...els.meters.querySelectorAll(".meter-bar")];
}

function meterSource() {
  const phase = audio?.speech.session?.phase;
  const label = dictation
    ? `Dictation · ${settings.sttSource === "mic" ? "microphone" : "demo clip"}`
    : phase === "playing"
      ? "Read aloud"
      : "Idle";
  els.meterLabel.textContent = label;
  if (!meterRunning && label !== "Idle") {
    meterRunning = true;
    requestAnimationFrame(meterFrame);
  }
}

function meterFrame() {
  const src = dictation ? audio?.stt : audio?.speech.session?.phase === "playing" ? audio.tts : null;
  const values = src?.values;
  for (let i = 0; i < meterBars.length; i++) {
    meterBars[i].style.transform = `scaleY(${(0.04 + 0.96 * (values?.[i] ?? 0)).toFixed(3)})`;
  }
  if (src) requestAnimationFrame(meterFrame);
  else meterRunning = false;
}

// ----------------------------------------------------------------- theme --

const THEMES = ["system", "light", "dark"];
function applyTheme() {
  const t = settings.theme;
  if (t === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  els.theme.innerHTML = icon(t === "light" ? "sun" : t === "dark" ? "moon" : "system");
  els.theme.setAttribute("aria-label", `Theme: ${t}. Switch theme`);
  els.theme.title = `Theme: ${t}`;
}

// ---------------------------------------------------------------- figure --

function drawFigure(canvas) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = "lighter";
  const css = bandPalette("prism", 6).css;
  const mid = h / 2;
  const merge = w * 0.66;
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const k = Math.max(0, 1 - x / merge) ** 1.6;
      const y = mid + (Math.sin(x / (44 - i * 6) + i * 1.3) * h * 0.2 + (i - 2.5) * h * 0.05) * k;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = css[i];
    ctx.shadowColor = css[i];
    ctx.shadowBlur = 6;
    ctx.stroke();
  }
}

// ------------------------------------------------------------------ misc --

let toastTimer = 0;
function toast(text) {
  els.toast.textContent = text;
  els.toast.hidden = false;
  els.toast.classList.remove("is-in");
  void els.toast.offsetWidth;
  els.toast.classList.add("is-in");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove("is-in");
    setTimeout(() => (els.toast.hidden = true), 250);
  }, 5200);
}

function updateDockNote() {
  const source = settings.sttSource === "mic" ? "microphone" : "demo clip";
  els.note.innerHTML = `<span>Voice: ${source}</span><span><kbd>M</kbd> dictate</span><span><kbd>Space</kbd> pause</span><span><kbd>←</kbd> <kbd>→</kbd> sentence</span><span><kbd>Esc</kbd> stop</span>`;
}

function setPanel(open) {
  document.body.classList.toggle("panel-open", open);
  els.tune.setAttribute("aria-expanded", String(open));
  els.scrim.hidden = !open;
}

// ------------------------------------------------------------------ wire --

for (const article of document.querySelectorAll(".msg.bot[data-clip]")) registerMessage(article);

els.composer.addEventListener("submit", (e) => {
  e.preventDefault();
  send();
});
els.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    send();
  }
});
els.input.addEventListener("input", autosize);
els.mic.addEventListener("click", toggleDictation);
els.theme.addEventListener("click", () => set("theme", THEMES[(THEMES.indexOf(settings.theme) + 1) % THEMES.length]));
els.tune.addEventListener("click", () => setPanel(!document.body.classList.contains("panel-open")));
els.scrim.addEventListener("click", () => setPanel(false));
els.reset.addEventListener("click", () => {
  const theme = settings.theme;
  Object.assign(settings, DEFAULTS, { theme });
  saveSettings();
  buildPanel();
  buildMeters();
  player.setColors(uiColors());
  audio?.stt.setCount(settings.bands);
  audio?.tts.setCount(settings.bands);
  audio?.stt.setSensitivity(settings.sensitivity);
  updateDockNote();
  applyAura();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (dictation) stopDictation({ cancel: true });
    else if (audio?.speech.session) audio.speech.stop();
    else if (document.body.classList.contains("panel-open")) setPanel(false);
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
  const session = audio?.speech.session;
  if (e.key === "m" || e.key === "M") {
    e.preventDefault();
    toggleDictation();
  } else if (session && (e.key === " " || e.key === "k")) {
    if (e.key === " " && e.target.closest?.("button, a")) return;
    e.preventDefault();
    audio.speech.toggle();
  } else if (session && (e.key === "ArrowLeft" || e.key === "j")) {
    e.preventDefault();
    audio.speech.prev();
  } else if (session && (e.key === "ArrowRight" || e.key === "l")) {
    e.preventDefault();
    audio.speech.next();
  }
});

// The reply's table shows the six prism colors the aura uses by default.
const swatches = bandPalette("prism", 6);
document.querySelectorAll(".swatch[data-band]").forEach((el) => {
  const i = Number(el.dataset.band);
  el.style.setProperty("--c-dark", swatches.css[i]);
  el.style.setProperty("--c-light", swatches.cssLight[i]);
});

const figures = document.querySelectorAll("canvas.fig-bands");
const figureObserver = new ResizeObserver((entries) => entries.forEach((e) => drawFigure(e.target)));
figures.forEach((c) => figureObserver.observe(c));

applyTheme();
buildPanel();
buildMeters();
updateDockNote();
applyAura();
setVoiceUi("idle");
els.scroll.scrollTop = els.scroll.scrollHeight;

// A short sweep around the composer on load, so it's clear where the glow lives.
if (!reducedMotion.matches) {
  setTimeout(() => {
    if (dictation) return;
    sttAura.setAnchor(sttAnchorEl(), { glide: false });
    sttAura.setState("working");
    setTimeout(() => {
      if (!dictation) sttAura.setState("hidden");
    }, 1700);
  }, 600);
}
