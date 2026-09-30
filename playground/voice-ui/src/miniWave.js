// A small version of the aura for the player: the same mirrored spectrum,
// one line per band, lifting up and down where that band has energy. The left
// half follows the levels a little more slowly, so it is not a copy. On dark
// backgrounds the lines add up to white. On light backgrounds a neutral line
// sits underneath and each band shows only while it has energy.

export function createMiniWave(canvas, { levels, colors }) {
  const ctx = canvas.getContext("2d");
  const amp = new Float32Array(8);
  const ampLeft = new Float32Array(8);
  let palette = colors;
  let state = "still";
  let raf = 0;
  let last = 0;
  let work = 0;
  let light = false;
  let checkedAt = -1e9;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    if (now - checkedAt > 600) {
      checkedAt = now;
      light = getComputedStyle(canvas).getPropertyValue("--aura-mode").trim() === "light";
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";

    const colorsNow = light ? palette.light : palette.dark;
    const n = colorsNow.length;
    const src = state === "live" ? levels() : null;
    work += ((state === "working" ? 1 : 0) - work) * (1 - Math.exp(-dt / 0.2));
    const head = ((now / 1000) * 0.9) % 1.3;
    const mid = h / 2;
    const room = mid - 2;
    const spacing = 0.92 / n;
    const sigma = spacing * 0.72;

    if (light) {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgb(140 146 156)";
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(w, mid);
      ctx.stroke();
    } else {
      ctx.globalCompositeOperation = "lighter";
    }

    for (let i = 0; i < n; i++) {
      amp[i] += ((src?.[i] ?? 0) - amp[i]) * (1 - Math.exp(-dt / 0.04));
      ampLeft[i] += ((src?.[i] ?? 0) - ampLeft[i]) * (1 - Math.exp(-dt / 0.12));
      const centre = (i + 0.5) * spacing;
      const shift = spacing * 0.22 * Math.sin(i * 2.61 + 1.3);
      const lifts = [];
      let peak = 0;
      for (let x = 0; x <= w; x += 1) {
        const u = (x / w) * 2 - 1;
        const ax = Math.abs(u);
        const right = Math.min(1, Math.max(0, (u + 0.14) / 0.28));
        const zr = (ax - centre) / sigma;
        const zl = (ax - centre - shift) / (sigma * 0.86);
        const band =
          amp[i] * Math.exp(-zr * zr) * right + ampLeft[i] * Math.exp(-zl * zl) * (1 - right);
        const sweep = work * Math.exp(-(((ax - head + i * 0.04) / 0.1) ** 2)) * 0.55;
        const lift = Math.min(1, band + sweep) * room;
        lifts.push(lift);
        peak = Math.max(peak, lift);
      }
      ctx.globalAlpha = light ? Math.min(1, peak / 2) : 1;
      if (ctx.globalAlpha < 0.02) continue;
      ctx.strokeStyle = colorsNow[i];
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        lifts.forEach((lift, x) => {
          if (x === 0) ctx.moveTo(x, mid + sign * lift);
          else ctx.lineTo(x, mid + sign * lift);
        });
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  return {
    /** "still" (flat line), "live" (follows levels), "working" (a bump sweeps out) */
    setState(next) {
      state = next;
    },
    /** { dark: string[], light: string[] } */
    setColors(next) {
      palette = next;
    },
    start() {
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
