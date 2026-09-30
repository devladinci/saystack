// Clips are fetched once and played from blob URLs, so seeking works on any
// static server, including ones without HTTP range support.

const cache = new Map();

export function clipUrl(src) {
  let url = cache.get(src);
  if (!url) {
    url = fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${src}`);
        return res.blob();
      })
      .then((blob) => URL.createObjectURL(blob));
    url.catch(() => cache.delete(src));
    cache.set(src, url);
  }
  return url;
}

let silence = "";

/** A very short silent WAV. Playing it inside a click unlocks an audio element in Safari. */
export function silentUrl() {
  if (silence) return silence;
  const n = 256;
  const rate = 22050;
  const view = new DataView(new ArrayBuffer(44 + n * 2));
  const text = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + n * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, n * 2, true);
  silence = URL.createObjectURL(new Blob([view.buffer], { type: "audio/wav" }));
  return silence;
}
