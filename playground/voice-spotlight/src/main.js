import { AURA_RANGES, DEFAULT_AURA_STYLE } from "@saystack/core";
import { createAura } from "@saystack/web";

const $ = (sel) => document.querySelector(sel);
const phone = $('#phone');
const list = $('#list');
const draft = $('#draft');
const sendBtn = $('#send');
const micBtn = $('#mic');
const backdrop = $('#backdrop');
const capMeasure = $('#capMeasure');
const capText = $('#capText');
const capHint = $('#capHint');
const reader = $('#reader');
const readerScroll = $('#readerScroll');
const player = $('#player');
const pTitle = $('#pTitle');
const pTime = $('#pTime');
const track = $('#track');
const trackFill = $('#trackFill');
const pMain = $('#pMain');
const pRate = $('#pRate');
const pStop = $('#pStop');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const icon = (name) => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const PAD = 12;
const SCRIPT = [
  'Remind me on Friday evening to pack a light jacket and charge my phone before the hike.',
  'Also check the weather for Saturday morning, and if rain looks likely, plan the shorter forest loop instead of the ridge.',
  'Ask Marko whether he still wants to come, because we need to book the table at the hut before Thursday.',
  'And add water, snacks, sunscreen and the first aid kit to the packing list, then send the list to both of us.',
].join(' ');
const CAP_STEPS = [{ size: 26, lines: 4 }, { size: 21, lines: 6 }, { size: 18, lines: 8 }];
const CHAT = [
  { role: 'user', text: 'Can you plan a Saturday hike near Zagreb?' },
  { role: 'assistant', id: 'plan', paras: [
    "Here's a plan for Saturday. Leave around nine, so you reach the Sljeme trailhead before the car park fills.",
    'The loop to Puntijarka takes about four hours, with a mountain hut at the halfway point for lunch. Pack a light jacket, because the ridge gets windy after noon.',
  ] },
  { role: 'user', text: 'Nice. Remind me on Friday?' },
  { role: 'assistant', id: 'remind', paras: ["Done. I'll remind you on Friday at 18:00 to pack and charge your phone."] },
];

let state = 'idle';
let streaming = true;
const messages = new Map();
const dict = { active: false, words: [], timers: [], startedAt: 0, cancel: false, pointerId: null, cx: 0, cy: 0, step: 0, auto: false, speed: 1 };
const play = { id: null, elapsed: 0, running: false, loading: false, done: false, focus: false, rate: 1, cur: -1, hideTimer: 0, loadTimer: 0, doneTimer: 0 };
const micLevel = { v: 0, kick: -1e9, peak: 0 };
const presence = { v: 0, t: 0 };
const voice = { v: 0 };

const fmt = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function addMessage(m) {
  const row = document.createElement('div');
  row.className = `msg ${m.role}`;
  if (m.role === 'user') {
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = m.text;
    row.append(bubble);
    list.append(row);
    return;
  }
  const textEl = document.createElement('div');
  textEl.className = 'msg-text';
  const words = [];
  let t = 250;
  m.paras.forEach((para, pi) => {
    const p = document.createElement('p');
    const tokens = para.split(/\s+/);
    tokens.forEach((tok, ti) => {
      const span = document.createElement('span');
      span.className = 'w';
      span.dataset.i = String(words.length);
      span.textContent = tok;
      p.append(span);
      if (ti < tokens.length - 1) p.append(' ');
      const letters = tok.replace(/[^\p{L}\p{N}]/gu, '').length;
      const dur = 150 + 38 * letters;
      let pause = /[.!?]$/.test(tok) ? 380 : /[,;:]$/.test(tok) ? 170 : 40;
      if (ti === tokens.length - 1) pause = pi < m.paras.length - 1 ? 520 : 0;
      words.push({ text: tok, start: t, end: t + dur });
      t += dur + pause;
    });
    textEl.append(p);
  });
  const actions = document.createElement('div');
  actions.className = 'msg-actions';
  actions.innerHTML = `<button class="act" aria-label="Copy">${icon('copy')}</button><button class="act speak" aria-label="Read aloud">${icon('volume')}</button><button class="act" aria-label="Regenerate">${icon('refresh')}</button>`;
  actions.querySelector('.speak').addEventListener('click', () => startReading(m.id));
  row.append(textEl, actions);
  list.append(row);
  messages.set(m.id, { textEl, words, total: t + 200, html: textEl.innerHTML });
}

function renderChat() {
  list.innerHTML = '';
  messages.clear();
  CHAT.forEach(addMessage);
}

function autoGrow() {
  draft.style.height = 'auto';
  draft.style.height = `${Math.min(draft.scrollHeight, 112)}px`;
  sendBtn.classList.toggle('is-ready', draft.value.trim() !== '');
}

const hintText = () => (dict.cancel ? 'Release to cancel' : streaming ? 'Release to add it to your message' : 'Release to send');

function resetCaptions() {
  dict.step = 0;
  capText.style.fontSize = '';
  capText.classList.remove('is-scrolling');
  capText.scrollTop = 0;
}

const linesAt = (text, size) => {
  capMeasure.style.fontSize = `${size}px`;
  capMeasure.textContent = text;
  return Math.round(capMeasure.offsetHeight / (size * 1.3));
};

function fitCaptions() {
  const text = dict.words.join(' ');
  while (dict.step < CAP_STEPS.length - 1 && linesAt(text, CAP_STEPS[dict.step].size) > CAP_STEPS[dict.step].lines) dict.step += 1;
  const step = CAP_STEPS[dict.step];
  capText.style.fontSize = `${step.size}px`;
  const isScrolling = dict.step === CAP_STEPS.length - 1 && linesAt(text, step.size) > step.lines;
  capText.classList.toggle('is-scrolling', isScrolling);
  if (isScrolling) requestAnimationFrame(() => capText.scrollTo({ top: capText.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' }));
}

function startDictation({ auto = false, speed = 1 } = {}) {
  if (dict.active || state === 'dropping' || state === 'transcribing') return;
  if (play.id) stopReading(true);
  Object.assign(dict, { active: true, words: [], cancel: false, startedAt: performance.now(), auto, speed });
  state = 'dictating';
  resetCaptions();
  capText.className = 'cap-text is-idle';
  capText.textContent = 'Listening…';
  capHint.textContent = hintText();
  phone.classList.remove('is-cancel', 'is-dropping', 'is-transcribing');
  phone.classList.add('is-dictating');
  micBtn.classList.add('is-hot');
  presence.t = 1;
  setAuraState('active');
  if (streaming) scheduleWords();
  else startTimer();
  startLoop();
}

function scheduleWords() {
  let t = 560;
  SCRIPT.split(' ').forEach((tok) => {
    dict.timers.push(setTimeout(() => {
      if (!dict.active) return;
      if (dict.words.length === 0) {
        capText.textContent = '';
        capText.classList.remove('is-idle');
      }
      if (dict.words.length) capText.append(' ');
      const span = document.createElement('span');
      span.className = 'cw';
      span.textContent = tok;
      capText.append(span);
      dict.words.push(tok);
      micLevel.kick = performance.now();
      micLevel.peak = 0.75 + Math.random() * 0.25;
      micLevel.word = tok;
      fitCaptions();
    }, t / dict.speed));
    t += 240 + Math.random() * 150 + (/[,.]$/.test(tok) ? 260 : 0);
  });
  if (dict.auto) dict.timers.push(setTimeout(endDictation, (t + 700) / dict.speed));
}

function startTimer() {
  const tick = () => {
    if (!dict.active) return;
    const secs = Math.floor((performance.now() - dict.startedAt) / 1000);
    capHint.innerHTML = dict.cancel ? hintText() : `<span class="mono">0:${String(secs).padStart(2, '0')}</span> · ${hintText()}`;
  };
  tick();
  dict.timers.push(setInterval(tick, 250));
}

function clearDictTimers() {
  dict.timers.forEach((id) => { clearTimeout(id); clearInterval(id); });
  dict.timers = [];
}

function setCancel(isCancel) {
  if (isCancel === dict.cancel) return;
  dict.cancel = isCancel;
  phone.classList.toggle('is-cancel', isCancel);
  if (streaming) capHint.textContent = hintText();
}

function closeSpotlight(delay = 0) {
  const finish = () => {
    state = 'idle';
    phone.classList.remove('is-dictating', 'is-cancel', 'is-transcribing', 'is-dropping');
    presence.t = 0;
    setAuraState('hidden');
    setTimeout(() => { if (state === 'idle') { capText.textContent = ''; capHint.textContent = ''; resetCaptions(); } }, 260);
  };
  if (delay) setTimeout(finish, delay);
  else finish();
}

function endDictation() {
  if (!dict.active) return;
  const held = performance.now() - dict.startedAt;
  dict.active = false;
  clearDictTimers();
  micBtn.classList.remove('is-hot');
  const text = dict.words.join(' ');
  if (dict.cancel) {
    closeSpotlight();
    return;
  }
  if (held < 450 || (streaming && !text)) {
    state = 'hint';
    capText.className = 'cap-text is-idle';
    capText.textContent = 'Hold to talk';
    capHint.textContent = '';
    closeSpotlight(650);
    return;
  }
  if (streaming) dropIntoDraft(text);
  else transcribe();
}

function dropIntoDraft(text) {
  state = 'dropping';
  const from = capText.getBoundingClientRect();
  const to = draft.getBoundingClientRect();
  const scale = 15.5 / (parseFloat(getComputedStyle(capText).fontSize) || 26);
  const dx = to.left + (from.width * scale) / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  phone.classList.remove('is-dictating', 'is-cancel');
  phone.classList.add('is-dropping');
  presence.t = 0;
  setAuraState('hidden');
  const anim = capText.animate([
    { transform: 'none', opacity: 1, filter: 'blur(0px)' },
    { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0, filter: 'blur(2px)' },
  ], { duration: reduceMotion ? 1 : 340, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' });
  setTimeout(() => {
    const current = draft.value.replace(/\s+$/, '');
    draft.value = current ? `${current} ${text}` : text;
    autoGrow();
    draft.classList.remove('is-arriving');
    void draft.offsetWidth;
    draft.classList.add('is-arriving');
  }, reduceMotion ? 0 : 170);
  anim.onfinish = () => {
    phone.classList.remove('is-dropping');
    capText.textContent = '';
    capHint.textContent = '';
    resetCaptions();
    anim.cancel();
    state = 'idle';
  };
}

function transcribe() {
  state = 'transcribing';
  phone.classList.remove('is-dictating', 'is-cancel');
  phone.classList.add('is-transcribing');
  capText.className = 'cap-text is-idle is-shimmer';
  capText.textContent = 'Transcribing…';
  capHint.textContent = '';
  presence.t = 0.35;
  setAuraState('working');
  setTimeout(() => {
    capText.classList.remove('is-shimmer');
    closeSpotlight();
    addMessage({ role: 'user', text: SCRIPT });
    list.scrollTo({ top: list.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, 1100);
}

micBtn.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  try { micBtn.setPointerCapture(e.pointerId); } catch { /* not available on every pointer type */ }
  const r = micBtn.getBoundingClientRect();
  Object.assign(dict, { pointerId: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 });
  startDictation();
});
micBtn.addEventListener('pointermove', (e) => {
  if (!dict.active || e.pointerId !== dict.pointerId) return;
  setCancel(Math.hypot(e.clientX - dict.cx, e.clientY - dict.cy) > 72);
});
micBtn.addEventListener('pointerup', (e) => { if (e.pointerId === dict.pointerId) endDictation(); });
micBtn.addEventListener('pointercancel', () => { if (dict.active) { setCancel(true); endDictation(); } });
micBtn.addEventListener('contextmenu', (e) => e.preventDefault());
micBtn.addEventListener('keydown', (e) => {
  if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); startDictation(); }
  if (e.key === 'Escape' && dict.active) { setCancel(true); endDictation(); }
});
micBtn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') endDictation(); });

function currentWord(m, t) {
  let idx = -1;
  for (let i = 0; i < m.words.length; i += 1) {
    if (m.words[i].start <= t) idx = i;
    else break;
  }
  return idx;
}

function setNow(root, prev, next) {
  if (prev >= 0) root.querySelector(`.w[data-i="${prev}"]`)?.classList.remove('now');
  if (next >= 0) root.querySelector(`.w[data-i="${next}"]`)?.classList.add('now');
}

function keepInView(el) {
  if (!el || readerScroll.scrollHeight <= readerScroll.clientHeight) return;
  const top = el.offsetTop;
  const view = readerScroll.scrollTop;
  if (top < view + 24 || top > view + readerScroll.clientHeight - 48) {
    readerScroll.scrollTo({ top: top - readerScroll.clientHeight / 3, behavior: reduceMotion ? 'auto' : 'smooth' });
  }
}

function applyHighlight() {
  const m = messages.get(play.id);
  if (!m) return;
  const idx = play.loading || play.done ? -1 : currentWord(m, play.elapsed);
  if (idx === play.cur) return;
  setNow(m.textEl, play.cur, idx);
  setNow(readerScroll, play.cur, idx);
  play.cur = idx;
  if (play.focus) keepInView(readerScroll.querySelector(`.w[data-i="${idx}"]`));
}

function updatePlayer() {
  const m = messages.get(play.id);
  if (!m) return;
  const icons = play.done ? 'refresh' : play.running || play.loading ? 'pause' : 'play';
  pMain.innerHTML = icon(icons);
  pMain.setAttribute('aria-label', play.done ? 'Replay' : play.running ? 'Pause' : 'Play');
  pTitle.textContent = play.loading ? 'Preparing audio…' : play.done ? 'Finished' : play.running ? 'Reading reply' : 'Paused';
  player.classList.toggle('is-loading', play.loading);
  updateClock();
}

function updateClock() {
  const m = messages.get(play.id);
  if (!m) return;
  pTime.textContent = `${fmt(play.elapsed)} / ${fmt(m.total)}`;
  trackFill.style.width = `${Math.min(100, (play.elapsed / m.total) * 100)}%`;
}

function startReading(id) {
  if (dict.active || state === 'dropping' || state === 'transcribing') return;
  if (play.id === id && !play.done) {
    openFocus();
    return;
  }
  if (play.id) stopReading(true);
  Object.assign(play, { id, elapsed: 0, running: false, loading: true, done: false, cur: -1 });
  openFocus();
  updatePlayer();
  play.loadTimer = setTimeout(() => {
    if (play.id !== id) return;
    play.loading = false;
    play.running = true;
    updatePlayer();
  }, 950);
  startLoop();
}

function openFocus() {
  const m = messages.get(play.id);
  if (!m) return;
  clearTimeout(play.hideTimer);
  clearTimeout(play.doneTimer);
  play.focus = true;
  state = 'reading';
  readerScroll.innerHTML = m.html;
  readerScroll.style.maxHeight = 'none';
  readerScroll.scrollTop = 0;
  if (play.cur >= 0) setNow(readerScroll, -1, play.cur);
  const pr = phone.getBoundingClientRect();
  const sr = m.textEl.getBoundingClientRect();
  const top = sr.top - pr.top - PAD;
  reader.style.transition = 'none';
  reader.classList.remove('is-lifted');
  reader.style.top = `${top}px`;
  reader.classList.add('is-on');
  m.textEl.classList.add('is-away');
  const nav = phone.querySelector('.nav').getBoundingClientRect();
  const minTop = nav.bottom - pr.top + 10;
  const maxBottom = phone.clientHeight - player.offsetHeight - 26 - 16;
  const room = maxBottom - minTop;
  let h = reader.offsetHeight;
  let dy = 0;
  if (h > room) {
    readerScroll.style.maxHeight = `${room - PAD * 2}px`;
    h = room;
    dy = minTop - top;
  } else if (top + h > maxBottom) {
    dy = maxBottom - (top + h);
  } else if (top < minTop) {
    dy = minTop - top;
  }
  reader.style.setProperty('--dy', `${dy}px`);
  void reader.offsetWidth;
  reader.style.transition = '';
  phone.classList.add('is-reading');
  requestAnimationFrame(() => reader.classList.add('is-lifted'));
  if (play.cur >= 0) requestAnimationFrame(() => keepInView(readerScroll.querySelector(`.w[data-i="${play.cur}"]`)));
}

function lowerCard(then) {
  const m = messages.get(play.id);
  setAuraState('hidden');
  reader.classList.remove('is-lifted');
  phone.classList.remove('is-reading');
  readerScroll.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  play.hideTimer = setTimeout(() => {
    reader.classList.remove('is-on');
    if (m) m.textEl.classList.remove('is-away');
    then();
  }, reduceMotion ? 0 : 360);
}

function stopReading(instant) {
  const m = messages.get(play.id);
  clearTimeout(play.loadTimer);
  clearTimeout(play.doneTimer);
  const cleanup = () => {
    if (m) {
      setNow(m.textEl, play.cur, -1);
      m.textEl.classList.remove('is-away');
    }
    play.cur = -1;
    Object.assign(play, { id: null, running: false, loading: false, done: false, focus: false });
    if (state === 'reading') state = 'idle';
  };
  if (play.focus && !instant) {
    play.focus = false;
    lowerCard(cleanup);
    return;
  }
  clearTimeout(play.hideTimer);
  setAuraState('hidden');
  reader.classList.remove('is-lifted', 'is-on');
  phone.classList.remove('is-reading');
  cleanup();
}

function finishReading() {
  const m = messages.get(play.id);
  play.elapsed = m.total;
  play.running = false;
  play.done = true;
  setNow(m.textEl, play.cur, -1);
  setNow(readerScroll, play.cur, -1);
  play.cur = -1;
  updatePlayer();
  // The blur stays for the whole reading; once it has finished, the spotlight closes by itself.
  if (play.focus) play.doneTimer = setTimeout(() => { if (play.done && play.focus) stopReading(false); }, 1100);
}

function replay() {
  Object.assign(play, { elapsed: 0, running: true, done: false });
  applyHighlight();
  updatePlayer();
  startLoop();
}

pMain.addEventListener('click', () => {
  if (!play.id || play.loading) return;
  if (play.done) replay();
  else {
    play.running = !play.running;
    updatePlayer();
    startLoop();
  }
});
pRate.addEventListener('click', () => {
  const rates = [1, 1.25, 1.5];
  play.rate = rates[(rates.indexOf(play.rate) + 1) % rates.length];
  pRate.textContent = `${play.rate}×`;
});
pStop.addEventListener('click', () => stopReading(false));
track.addEventListener('click', (e) => {
  const m = messages.get(play.id);
  if (!m || play.loading) return;
  const r = track.getBoundingClientRect();
  play.elapsed = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * m.total;
  if (play.done) { play.done = false; play.running = true; }
  applyHighlight();
  updatePlayer();
  startLoop();
});
readerScroll.addEventListener('click', (e) => {
  const w = e.target.closest('.w');
  const m = messages.get(play.id);
  if (!w || !m || play.loading) return;
  play.elapsed = m.words[Number(w.dataset.i)].start;
  if (play.done) play.done = false;
  play.running = true;
  applyHighlight();
  updatePlayer();
  startLoop();
});
const MAX_BANDS = 8;
const auraLevels = new Float32Array(MAX_BANDS);
// While a reply is read, the same top wave follows the simulated voice.
const readerLevels = new Float32Array(MAX_BANDS);
let wordShape = new Float32Array(MAX_BANDS).fill(0.3);
let lastKick = -1;
let nextSyllable = 0;
let phoneMode = 'light';
const DEFAULT_STYLE = { ...DEFAULT_AURA_STYLE, placement: 'top', outline: 'fade' };
const auraStyle = { ...DEFAULT_STYLE };

const auraOptions = () => ({
  isInside: true,
  clip: $('#auraClip'),
  gap: 0,
  levels: () => (play.focus ? readerLevels : auraLevels),
  mode: phoneMode,
  zIndex: 25,
  style: { ...auraStyle },
});

const resample = (values, count) => {
  const out = new Float32Array(MAX_BANDS);
  for (let i = 0; i < count; i += 1) {
    const pos = count > 1 ? (i * (values.length - 1)) / (count - 1) : 0;
    const low = Math.floor(pos);
    const high = Math.min(values.length - 1, low + 1);
    out[i] = values[low] * (1 - (pos - low)) + values[high] * (pos - low);
  }
  return out;
};
const makeAura = () => createAura({ anchor: $('#auraAnchor'), ...auraOptions() });
let aura = makeAura();
let auraState = 'hidden';
const setAuraState = (next) => {
  auraState = next;
  aura?.setState(next);
};

let readerShape = new Float32Array(MAX_BANDS).fill(0.3);
let readerWord = -1;
const readerAuraState = () => (!play.id || !play.focus || play.done ? 'hidden' : play.loading ? 'working' : play.running ? 'active' : 'paused');

function shapeFor(word, bands = auraStyle.bands ?? 7) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  const count = (re) => (w.match(re) || []).length;
  const vowels = count(/[aeiou]/g);
  const hiss = count(/sh|ch|th|[szfxc]/g);
  const soft = count(/[mnlrwyv]/g);
  const pop = count(/[ptkbdgj]/g);
  const total = Math.max(1, vowels + hiss + soft + pop);
  const v = vowels / total;
  const h = hiss / total;
  const n = soft / total;
  const b = pop / total;
  const weights = [
    0.35 + 0.9 * v + 0.3 * n,
    0.3 + v + 0.4 * n,
    0.25 + 0.7 * v + 0.5 * n + 0.4 * b,
    0.2 + 0.3 * v + 0.4 * n + 0.6 * b,
    0.12 + 0.9 * h + 0.4 * b,
    0.08 + h + 0.2 * b,
    0.05 + 0.9 * h,
  ];
  const peak = Math.max(...weights);
  return resample(weights.map((x) => Math.min(1, (x / peak) ** 1.6 * (0.85 + 0.15 * Math.random()))), bands);
}

const SCRIPT_WORDS = SCRIPT.split(' ');

let bandKick = -1e9;

function updateBands(now, dt) {
  if (micLevel.kick !== lastKick) {
    lastKick = micLevel.kick;
    bandKick = now;
    if (micLevel.word) wordShape = shapeFor(micLevel.word);
  }
  if (dict.active && !streaming && now > nextSyllable) {
    wordShape = shapeFor(SCRIPT_WORDS[Math.floor(Math.random() * SCRIPT_WORDS.length)]);
    bandKick = now;
    nextSyllable = now + 150 + Math.random() * 120;
  }
  const envelope = dict.active ? Math.max(0, 1 - (now - bandKick) / 450) ** 0.7 : 0;
  const syllable = 0.75 + 0.25 * Math.abs(Math.sin((now / 1000) * Math.PI * 4.4));
  for (let i = 0; i < MAX_BANDS; i += 1) {
    const target = wordShape[i] * envelope * syllable;
    auraLevels[i] += (target - auraLevels[i]) * Math.min(1, dt / (target > auraLevels[i] ? 35 : 160));
  }
}

function updateReaderLevels(now, dt) {
  const m = messages.get(play.id);
  if (m && play.cur !== readerWord) {
    readerWord = play.cur;
    if (play.cur >= 0) readerShape = shapeFor(m.words[play.cur].text);
  }
  const word = m && play.cur >= 0 ? m.words[play.cur] : null;
  const speaking = word && play.running && play.elapsed < word.end ? 1 : 0;
  const syllable = 0.75 + 0.25 * Math.abs(Math.sin((now / 1000) * Math.PI * 4.4));
  for (let i = 0; i < MAX_BANDS; i += 1) {
    const target = readerShape[i] * speaking * syllable;
    readerLevels[i] += (target - readerLevels[i]) * Math.min(1, dt / (target > readerLevels[i] ? 35 : 160));
  }
  if (play.focus) setAuraState(readerAuraState());
}

function updateLevels(now, dt) {
  let target = 0;
  if (dict.active && streaming) {
    const burst = Math.max(0, 1 - (now - micLevel.kick) / 420);
    target = 0.14 + 0.8 * burst * micLevel.peak + 0.04 * Math.sin(now / 70);
  } else if (dict.active) {
    target = 0.2 + 0.6 * Math.max(0, Math.sin(now / 140) * Math.sin(now / 610));
  }
  micLevel.v += (target - micLevel.v) * Math.min(1, dt / 70);
  updateBands(now, dt);
  presence.v += (presence.t - presence.v) * Math.min(1, dt / 160);
  let speak = 0;
  const m = messages.get(play.id);
  if (m && play.running && play.cur >= 0) {
    const word = m.words[play.cur];
    speak = play.elapsed < word.end ? 0.55 + 0.45 * Math.abs(Math.sin(now / 95)) : 0.12;
  } else if (m && play.loading) {
    speak = 0.3 + 0.2 * Math.sin(now / 300);
  }
  voice.v += (speak - voice.v) * Math.min(1, dt / 90);
}

let raf = 0;
let last = 0;
function startLoop() {
  if (raf) return;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

function frame(now) {
  const dt = Math.min(64, now - last);
  last = now;
  const m = messages.get(play.id);
  if (m && play.running) {
    play.elapsed += dt * play.rate;
    if (play.elapsed >= m.total) finishReading();
    else applyHighlight();
    updateClock();
  }
  updateLevels(now, dt);
  updateReaderLevels(now, dt);
  const busy = dict.active || state === 'dropping' || state === 'transcribing' || presence.v > 0.01 || play.running || play.loading || voice.v > 0.01;
  raf = busy ? requestAnimationFrame(frame) : 0;
}

draft.addEventListener('input', autoGrow);
sendBtn.addEventListener('click', () => {
  const text = draft.value.trim();
  if (!text) return;
  addMessage({ role: 'user', text });
  draft.value = '';
  autoGrow();
  list.scrollTo({ top: list.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
});

const streamSwitch = $('#streaming');
const streamNote = $('#streamNote');
streamSwitch.addEventListener('change', () => {
  streaming = streamSwitch.checked;
  streamNote.textContent = streaming
    ? 'Words appear while you speak, like Whisper on oMLX.'
    : 'Kotys transcribes when you let go and sends it as its own message, like Parakeet.';
});

$('#longDemo').addEventListener('click', () => {
  if (state !== 'idle') return;
  if (!streaming) {
    streamSwitch.checked = true;
    streamSwitch.dispatchEvent(new Event('change'));
  }
  startDictation({ auto: true, speed: 1.5 });
});

const AURA_CONTROLS = [
  { key: 'bands', label: 'Bands', options: [[5, '5'], [6, '6'], [7, '7'], [8, '8']] },
  { key: 'layout', label: 'Layout', options: [['mirror', 'Mirrored'], ['linear', 'Low → high'], ['flow', 'Flow']] },
  { key: 'palette', label: 'Colors', options: [['prism', 'Prism'], ['aurora', 'Aurora'], ['sunset', 'Sunset'], ['mono', 'Mono']] },
  { key: 'lift', label: 'Lift', format: (v) => `${Math.round(v)} px` },
  { key: 'lineWidth', label: 'Line width', format: (v) => `${v.toFixed(1)} px` },
  { key: 'aura', label: 'Aura', format: (v) => v.toFixed(2) },
  { key: 'auraSize', label: 'Aura size', format: (v) => `${Math.round(v)} px` },
  { key: 'brightness', label: 'Brightness', format: (v) => v.toFixed(2) },
  { key: 'rippleSpeed', label: 'Ripple speed', format: (v) => `${v.toFixed(2)}×` },
  { key: 'resolution', label: 'Resolution', format: (v) => `${v.toFixed(2)}×` },
  { key: 'blur', label: 'Blur', format: (v) => (v === 0 ? 'Crisp' : `${v} px`) },
];

function rebuildAura() {
  aura?.destroy();
  aura = makeAura();
  aura?.setState(auraState);
}

function renderAuraControls() {
  const host = $('#auraControls');
  const ranges = AURA_RANGES;
  host.innerHTML = '';
  AURA_CONTROLS.forEach((spec) => {
    const wrap = document.createElement('div');
    wrap.className = 'ctrl';
    const head = document.createElement('div');
    head.className = 'ctrl-head';
    const name = document.createElement('span');
    name.textContent = spec.label;
    head.append(name);
    wrap.append(head);
    if (spec.options) {
      const seg = document.createElement('div');
      seg.className = 'seg seg-wide';
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', spec.label);
      spec.options.forEach(([value, text]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = text;
        button.setAttribute('aria-pressed', String(auraStyle[spec.key] === value));
        button.addEventListener('click', () => {
          auraStyle[spec.key] = value;
          seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
          if (spec.key === 'bands') wordShape = shapeFor(micLevel.word || 'hello');
          rebuildAura();
        });
        seg.append(button);
      });
      wrap.append(seg);
    } else {
      const range = ranges[spec.key] ?? { min: 0, max: 1, step: 0.01 };
      const out = document.createElement('output');
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(range.min);
      input.max = String(range.max);
      input.step = String(range.step);
      input.value = String(auraStyle[spec.key]);
      input.setAttribute('aria-label', spec.label);
      out.textContent = spec.format(Number(auraStyle[spec.key]));
      input.addEventListener('input', () => {
        auraStyle[spec.key] = Number(input.value);
        out.textContent = spec.format(auraStyle[spec.key]);
        aura?.update(auraOptions());
      });
      head.append(out);
      wrap.append(input);
    }
    host.append(wrap);
  });
}

renderAuraControls();
$('#auraReset').addEventListener('click', () => {
  Object.assign(auraStyle, DEFAULT_STYLE);
  rebuildAura();
  renderAuraControls();
});

function setPhoneTheme(value) {
  phone.dataset.phone = value;
  phoneMode = value;
  rebuildAura();
  const redrawBlur = () => {
    backdrop.style.display = 'none';
    requestAnimationFrame(() => {
      backdrop.style.display = '';
    });
  };
  redrawBlur();
  setTimeout(redrawBlur, 120);
  document.querySelectorAll('[data-phone-theme]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.phoneTheme === value)));
}
document.querySelectorAll('[data-phone-theme]').forEach((b) => b.addEventListener('click', () => setPhoneTheme(b.dataset.phoneTheme)));
const rootTheme = document.documentElement.dataset.theme;
setPhoneTheme(rootTheme ? rootTheme : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

const blur = $('#blur');
const dim = $('#dim');
blur.addEventListener('input', () => { phone.style.setProperty('--blur', `${blur.value}px`); $('#blurOut').textContent = `${blur.value} px`; });
dim.addEventListener('input', () => { phone.style.setProperty('--dim', String(Number(dim.value) / 100)); $('#dimOut').textContent = `${dim.value}%`; });

$('#reset').addEventListener('click', () => {
  if (play.id) stopReading(true);
  if (dict.active) { dict.active = false; clearDictTimers(); micBtn.classList.remove('is-hot'); }
  closeSpotlight();
  draft.value = '';
  autoGrow();
  renderChat();
});

renderChat();
