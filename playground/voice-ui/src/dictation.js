// Dictation sources. Each one feeds a band analyser (for the aura) and
// reports the transcript as final text plus interim text.
//   mic:  getUserMedia for the levels, and the browser's SpeechRecognition,
//         where it exists, for streaming words.
//   demo: a recorded clip with word marks, replayed as if it were being
//         recognised live. Recent words stay interim for a moment, trailing
//         punctuation arrives when a word turns final, and two words are
//         misheard at first, the way live recognisers revise themselves.

const join = (...parts) =>
  parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(" ");

export function micErrorText(err) {
  if (err?.name === "NotAllowedError" || err?.name === "SecurityError") return "The microphone is blocked on this page.";
  if (err?.name === "NotFoundError") return "No microphone was found.";
  if (err?.name === "NotSupportedError") return "This page can't use the microphone.";
  return "The microphone didn't start.";
}

export async function startMic(context, analyser, { words = true, lang, onText, onError } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error("no getUserMedia"), { name: "NotSupportedError" });
  }
  const media = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const source = context.createMediaStreamSource(media);
  source.connect(analyser.node);

  const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  let recognition = null;
  let committed = "";
  let finals = "";
  let interim = "";
  let stopped = false;
  let ended = null;

  if (words && Recognition) {
    recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang || "en-US";
    recognition.onresult = (e) => {
      finals = "";
      interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finals += r[0].transcript;
        else interim += r[0].transcript;
      }
      onText?.(join(committed, finals), interim.trim());
    };
    recognition.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      onError?.(
        e.error === "not-allowed"
          ? "Speech recognition is blocked here, so only the aura runs."
          : `Speech recognition stopped (${e.error}).`,
      );
    };
    recognition.onend = () => {
      committed = join(committed, finals);
      finals = "";
      if (!stopped) {
        try {
          recognition.start();
          return;
        } catch {
          // already running
        }
      }
      ended?.();
    };
    try {
      recognition.start();
    } catch {
      recognition = null;
    }
  }

  function release() {
    source.disconnect();
    for (const track of media.getTracks()) track.stop();
  }

  return {
    words: !!recognition,
    async finish() {
      stopped = true;
      if (recognition) {
        await new Promise((resolve) => {
          ended = resolve;
          recognition.stop();
          setTimeout(resolve, 1500);
        });
      }
      release();
      return join(committed, finals, interim);
    },
    cancel() {
      stopped = true;
      recognition?.abort();
      release();
    },
  };
}

const MISHEARD = { colors: "collars", loud: "allowed" };
const HOLD_S = 0.45;

export async function startDemo(context, analyser, clip, { onText, onEnd } = {}) {
  const audio = new Audio(clip.src);
  audio.preload = "auto";
  const source = context.createMediaElementSource(audio);
  source.connect(analyser.node);
  source.connect(context.destination);

  const words = [];
  for (const seg of clip.timing.segments) {
    for (const m of seg.text.matchAll(/\S+/g)) {
      const mark = seg.marks.find(([c]) => c >= m.index && c < m.index + m[0].length);
      words.push({ text: m[0], t: mark ? mark[2] : seg.start });
    }
  }
  words.forEach((w, i) => {
    w.end = words[i + 1]?.t ?? clip.timing.duration;
  });

  const spokenBy = (t) => words.filter((w) => w.t <= t).map((w) => w.text).join(" ");
  function heard(w, t) {
    const bare = w.text.replace(/[.,!?;:]+$/, "");
    const wrong = MISHEARD[bare.toLowerCase()];
    return wrong && t - w.t < 0.32 ? wrong : bare;
  }
  function textAt(t) {
    const fin = [];
    const interim = [];
    for (const w of words) {
      if (w.t > t) break;
      if (t - w.end > HOLD_S) fin.push(w.text);
      else interim.push(heard(w, t));
    }
    return [fin.join(" "), interim.join(" ")];
  }

  let raf = 0;
  let last = "";
  let done = false;
  function tick() {
    const [fin, interim] = textAt(audio.currentTime);
    const key = `${fin}|${interim}`;
    if (key !== last) {
      last = key;
      onText?.(fin, interim);
    }
    raf = requestAnimationFrame(tick);
  }
  function release() {
    cancelAnimationFrame(raf);
    audio.pause();
    source.disconnect();
  }
  audio.addEventListener("ended", () => {
    cancelAnimationFrame(raf);
    done = true;
    onText?.(spokenBy(Infinity), "");
    onEnd?.();
  });

  await audio.play();
  raf = requestAnimationFrame(tick);
  return {
    words: true,
    async finish() {
      const text = spokenBy(done ? Infinity : audio.currentTime);
      release();
      return text;
    },
    cancel: release,
  };
}
