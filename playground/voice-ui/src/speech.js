// One read-aloud session at a time. The clip plays through Web Audio so the
// aura can analyse it, and the current word follows audio.currentTime.
// Replay reuses the loaded clip, the way a real player reuses cached audio.
//
// Phases: "preparing" → "playing" ⇄ "paused" → "ended", or "error".

import { clipUrl, silentUrl } from "./clips.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createSpeech(context, analyser) {
  const audio = new Audio();
  audio.preload = "auto";
  if ("preservesPitch" in audio) audio.preservesPitch = true;
  const source = context.createMediaElementSource(audio);
  source.connect(analyser.node);
  analyser.node.connect(context.destination);

  const events = new EventTarget();
  const emit = (type) => events.dispatchEvent(new Event(type));
  let session = null;
  let rate = 1;
  let raf = 0;
  let loaded = "";
  let unlocked = false;

  function setPhase(phase, error = null) {
    if (!session) return;
    session.phase = phase;
    session.error = error;
    if (phase === "playing") loop();
    emit("phase");
  }

  function cueAt(t) {
    const cues = session.msg.cues;
    let lo = 0;
    let hi = cues.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cues[mid].t <= t) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return found;
  }

  function sync() {
    if (!session) return;
    const i = Math.max(0, cueAt(audio.currentTime + 0.04));
    if (i !== session.cue) {
      session.cue = i;
      emit("cue");
    }
  }

  function loop() {
    cancelAnimationFrame(raf);
    const step = () => {
      if (!session || session.phase !== "playing") return;
      sync();
      emit("tick");
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function ready() {
    if (audio.readyState >= 1) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const done = () => {
        audio.removeEventListener("loadedmetadata", done);
        audio.removeEventListener("error", fail);
        resolve();
      };
      const fail = () => {
        audio.removeEventListener("loadedmetadata", done);
        audio.removeEventListener("error", fail);
        reject(new Error("The audio for this reply could not be loaded."));
      };
      audio.addEventListener("loadedmetadata", done);
      audio.addEventListener("error", fail);
    });
  }

  audio.addEventListener("ended", () => {
    if (!session) return;
    session.cue = session.msg.cues.length - 1;
    emit("cue");
    setPhase("ended");
  });

  async function start(msg, { from = 0, latency = 0 } = {}) {
    stop({ silent: true });
    const s = { msg, phase: "preparing", cue: -1, error: null };
    session = s;
    emit("phase");
    try {
      await context.resume();
      const [url] = await Promise.all([clipUrl(msg.src), wait(latency)]);
      if (session !== s) return;
      if (loaded !== url) {
        audio.src = url;
        loaded = url;
      }
      await ready();
      if (session !== s) return;
      audio.playbackRate = rate;
      audio.currentTime = from;
      await audio.play();
      if (session !== s) {
        audio.pause();
        return;
      }
      sync();
      setPhase("playing");
    } catch (err) {
      if (session === s) setPhase("error", err?.message || "The audio could not be played.");
    }
  }

  function stop({ silent = false } = {}) {
    cancelAnimationFrame(raf);
    audio.pause();
    if (!session) return;
    session = null;
    if (!silent) emit("phase");
  }

  function pause() {
    if (session?.phase !== "playing") return;
    audio.pause();
    setPhase("paused");
  }

  async function resume() {
    if (!session) return;
    if (session.phase === "paused") {
      const s = session;
      await context.resume();
      try {
        await audio.play();
        if (session === s) setPhase("playing");
      } catch (err) {
        if (session === s) setPhase("error", err?.message || "The audio could not be played.");
      }
    } else if (session.phase === "ended" || session.phase === "error") {
      start(session.msg);
    }
  }

  function seek(t) {
    if (!session || session.phase === "preparing") return;
    audio.currentTime = Math.max(0, Math.min(t, session.msg.duration - 0.05));
    sync();
    emit("tick");
    if (session.phase === "ended") resume().catch(() => {});
  }

  function sentenceIndex(t) {
    const list = session.msg.sentences;
    let k = 0;
    for (let i = 0; i < list.length; i++) if (list[i].start <= t + 0.05) k = i;
    return k;
  }

  return {
    /** Call inside a click: lets later play() calls through in Safari. */
    unlock() {
      if (unlocked) return;
      unlocked = true;
      const silent = silentUrl();
      audio.src = silent;
      loaded = silent;
      audio
        .play()
        .then(() => {
          if (loaded === silent) audio.pause();
        })
        .catch(() => {});
    },
    addEventListener: (...args) => events.addEventListener(...args),
    removeEventListener: (...args) => events.removeEventListener(...args),
    start,
    stop,
    pause,
    resume,
    toggle() {
      if (session?.phase === "playing") pause();
      else resume();
    },
    seek,
    next() {
      if (!session) return;
      const list = session.msg.sentences;
      const k = sentenceIndex(audio.currentTime);
      if (k + 1 < list.length) seek(list[k + 1].start);
    },
    prev() {
      if (!session) return;
      const list = session.msg.sentences;
      const k = sentenceIndex(audio.currentTime);
      const into = audio.currentTime - list[k].start;
      seek(into > 1.2 || k === 0 ? list[k].start : list[k - 1].start);
    },
    setRate(r) {
      rate = r;
      audio.playbackRate = r;
    },
    get rate() {
      return rate;
    },
    get session() {
      return session;
    },
    get time() {
      return session?.phase === "ended" ? session.msg.duration : audio.currentTime;
    },
    sentenceAt(t) {
      return session ? sentenceIndex(t) : -1;
    },
  };
}
