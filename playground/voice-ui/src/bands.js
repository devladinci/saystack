// Splits audio into log-spaced frequency bands for the aura. The bands share
// one automatic gain, so the spectrum keeps its shape: vowels light the low
// bands and an "s" lights the high ones, instead of every band maxing out on
// every syllable. A gentle treble tilt makes up for speech carrying much less
// energy up high, and each band's steady noise (hum, hiss) is subtracted.

export function bandEdges(count, minHz = 80, maxHz = 8000) {
  return Array.from({ length: count + 1 }, (_, i) => minHz * (maxHz / minHz) ** (i / count));
}

export function formatHz(hz) {
  return hz >= 1000 ? `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)}k` : `${Math.round(hz)}`;
}

const TILT_DB_PER_OCTAVE = 4;
const RANGE_DB = 30;
const SILENT_DB = -120;

export function createBandAnalyser(context, options = {}) {
  const analyser = context.createAnalyser();
  analyser.fftSize = options.fftSize ?? 2048;
  analyser.smoothingTimeConstant = 0.3;
  const spectrum = new Float32Array(analyser.frequencyBinCount);

  let count = 0;
  let ranges = [];
  let tilt;
  let noise;
  let values;
  let db;
  let peak = -60;
  let primed = false;
  let last = 0;
  let sensitivity = options.sensitivity ?? 1;

  function configure(n) {
    count = n;
    const edges = bandEdges(n, options.minHz, options.maxHz);
    const binHz = context.sampleRate / analyser.fftSize;
    ranges = [];
    tilt = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const lo = Math.max(1, Math.floor(edges[i] / binHz));
      const hi = Math.max(lo + 1, Math.min(spectrum.length, Math.ceil(edges[i + 1] / binHz)));
      ranges.push([lo, hi]);
      const centre = Math.sqrt(edges[i] * edges[i + 1]);
      tilt[i] = TILT_DB_PER_OCTAVE * Math.max(0, Math.log2(centre / 300));
    }
    noise = new Float32Array(n);
    values = new Float32Array(n);
    db = new Float32Array(n).fill(SILENT_DB);
    primed = false;
  }
  configure(options.count ?? 6);

  function read(now = performance.now()) {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    if (dt <= 0) return values;
    analyser.getFloatFrequencyData(spectrum);
    const noiseDown = 1 - Math.exp(-dt / 0.3);
    const noiseUp = 10 ** ((1.5 * dt) / 10);
    const attack = 1 - Math.exp(-dt / 0.025);
    const release = 1 - Math.exp(-dt / 0.14);

    let top = SILENT_DB;
    for (let i = 0; i < count; i++) {
      const [lo, hi] = ranges[i];
      let power = 0;
      for (let b = lo; b < hi; b++) {
        const v = spectrum[b];
        if (v > -160) power += 10 ** (v / 10);
      }
      power /= hi - lo;
      // Steady noise per band: follows dips quickly, rises by 1.5 dB/s.
      if (!primed || power < noise[i]) noise[i] += (power - noise[i]) * (primed ? noiseDown : 1);
      else noise[i] *= noiseUp;
      const clean = power - noise[i] * 1.4;
      db[i] = clean > 1e-13 ? 10 * Math.log10(clean) + tilt[i] : SILENT_DB;
      top = Math.max(top, db[i]);
    }
    primed = true;

    // One gain for all bands: jumps to the loudest band, then eases down 5 dB/s.
    peak = top > peak ? top : Math.max(-80, peak - 5 * dt);
    const range = RANGE_DB * sensitivity;
    for (let i = 0; i < count; i++) {
      const target = Math.min(1, Math.max(0, (db[i] - (peak - range)) / range)) ** 1.6;
      values[i] += (target - values[i]) * (target > values[i] ? attack : release);
    }
    return values;
  }

  return {
    node: analyser,
    read,
    get values() {
      return values;
    },
    /** Per-band level in dB after noise removal and tilt. */
    get decibels() {
      return db;
    },
    get count() {
      return count;
    },
    setCount(n) {
      if (n !== count) configure(n);
    },
    setSensitivity(s) {
      sensitivity = s;
    },
    reset() {
      values.fill(0);
      peak = -60;
      primed = false;
    },
  };
}
