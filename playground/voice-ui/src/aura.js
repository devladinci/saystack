// Spectral aura: a WebGL outline of light drawn around an element, or inside
// the page edges when there is no element. Every frequency band is a thin
// colored line riding the outline. At rest the lines sit on top of each other
// and add up to one white line. When the voice has energy in a band, that
// band's line lifts off the outline at its own place in the spectrum, like an
// equalizer, and where neighbouring bands overlap their colors mix. Nothing
// is drawn inside the element itself.
//
// Layouts:
//   mirror  low bands in the middle of the glowing edge, high bands at its ends
//   linear  low to high, left to right
//   flow    every band runs the whole outline as a wave that moves only while
//           the band has energy

import { bandPalette } from "./palette.js";

const MAX_BANDS = 8;

const VERTEX = `attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAGMENT = `precision highp float;
#define MAX_BANDS 8
#define TAU 6.2831853
#define HALF_PI 1.5707963
#define CLIP_FADE 24.0

uniform vec2 u_px;
uniform vec2 u_size;
uniform vec2 u_center;
uniform vec2 u_half;
uniform float u_radius;
uniform float u_pradius;
uniform float u_inner;
uniform float u_time;
uniform float u_count;
uniform vec4 u_band[MAX_BANDS];
uniform vec4 u_band2[MAX_BANDS];
uniform vec3 u_colors[MAX_BANDS];
uniform float u_mix;
uniform float u_height;
uniform float u_line;
uniform float u_gap;
uniform float u_glow;
uniform float u_gain;
uniform vec3 u_emph;
uniform float u_vis;
uniform float u_orbit;
uniform float u_lightMode;
uniform float u_layout;
uniform float u_specCenter;
uniform float u_span;
uniform float u_dir;
uniform float u_pxSize;
uniform float u_aura;
uniform vec4 u_clip;

// One band's bump in the spectrum layouts: height, and slope per unit of x.
vec2 bump(float x, float centre, float sigma, float level, float ripples, float phase) {
  float z = (x - centre) / sigma;
  float g = exp(-z * z);
  float rp = TAU * ripples * x + phase;
  float rip = 1.0 + 0.16 * sin(rp);
  float amp = u_height * level;
  return vec2(amp * g * rip, amp * g * ((-2.0 * z / sigma) * rip + 0.16 * TAU * ripples * cos(rp)));
}

// Flow layout: a travelling wave in 0..1 and its slope per unit of t.
vec2 flow(float cycles, float t, float phase, float i) {
  float pa = TAU * cycles * t + phase;
  float c2 = floor(cycles * 0.5) + 1.0;
  float pb = TAU * c2 * t - phase * 0.61 + i * 2.3;
  float a = 0.5 + 0.5 * sin(pa);
  float b = 0.62 + 0.38 * sin(pb);
  return vec2(a * b, 0.5 * TAU * cycles * cos(pa) * b + a * 0.38 * TAU * c2 * cos(pb));
}

void main() {
  vec2 px = vec2(gl_FragCoord.x / u_px.x, 1.0 - gl_FragCoord.y / u_px.y) * u_size;
  vec2 p = px - u_center;
  p.y = -p.y;
  vec2 a = abs(p);

  vec2 q = a - u_half + u_radius;
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - u_radius;
  float d = mix(sd, -sd, u_inner);
  float reach = u_gap + u_line + u_height * 1.3 + u_glow * 4.0 + 2.0;
  if (d < -1.5 || d > reach) {
    gl_FragColor = vec4(0.0);
    return;
  }

  // Position along the outline: 0..1 clockwise from the top centre. It uses
  // its own corner radius so that inward glows stay seamless at the corners.
  float r = u_pradius;
  vec2 c = max(u_half - r, 0.0);
  vec2 k = a - c;
  float quarter = c.x + HALF_PI * r + c.y;
  float sq;
  float ny;
  if (k.x > 0.0 && k.y > 0.0) {
    float th = atan(k.y, k.x);
    sq = c.x + r * (HALF_PI - th);
    ny = sin(th);
  } else if (k.y >= k.x) {
    sq = min(a.x, c.x);
    ny = 1.0;
  } else {
    sq = c.x + HALF_PI * r + c.y - min(a.y, c.y);
    ny = 0.0;
  }
  float s;
  if (p.y >= 0.0) {
    s = p.x >= 0.0 ? sq : 4.0 * quarter - sq;
  } else {
    s = p.x >= 0.0 ? 2.0 * quarter - sq : 2.0 * quarter + sq;
    ny = -ny;
  }
  float perim = 4.0 * quarter;
  float t = s / perim;

  float up = smoothstep(0.0, 1.0, max(ny, 0.0));
  float down = smoothstep(0.0, 1.0, max(-ny, 0.0));
  float emph = u_emph.y + (u_emph.x - u_emph.y) * up + (u_emph.z - u_emph.y) * down;

  // Where this pixel sits in the spectrum: x runs 0..1 from the lowest band
  // to the highest over the part of the outline that shows the bands.
  float rel = fract(t - u_specCenter + 0.5) - 0.5;
  float u = rel / u_span;
  float x = u_layout < 0.5 ? abs(u) : 0.5 + 0.5 * u * u_dir;
  float dxds = (u_layout < 0.5 ? sign(u) : 0.5 * u_dir) / (u_span * perim);
  float spread = 1.0 - smoothstep(0.96, 1.06, abs(u));
  float spacing = 0.92 / u_count;
  float sigma = spacing * 0.72;

  float head = fract(u_time * 0.14);
  float cw = max(36.0, perim * 0.028);
  float halfLine = u_line * 0.5;
  vec3 sum = vec3(0.0);
  vec3 tint = vec3(0.0);
  float tintWeight = 0.0;
  float clear = 1.0;
  for (int i = 0; i < MAX_BANDS; i++) {
    if (float(i) >= u_count) break;
    float fi = float(i);
    vec4 band = u_band[i];
    float h;
    float slope;
    if (u_layout < 1.5) {
      float centre = (fi + 0.5) * spacing;
      float ripples = 1.0 + fi * 0.7;
      vec2 b = bump(x, centre, sigma, band.x, ripples, band.y);
      if (u_layout < 0.5) {
        // The left half is a sibling, not a mirror copy: it shows the levels
        // a moment later, with its own ripples and slightly shifted bands.
        // The halves blend where they meet in the middle.
        vec4 other = u_band2[i];
        float jitter = spacing * 0.22 * sin(fi * 2.61 + 1.3);
        vec2 left = bump(x, centre + jitter, sigma * 0.86, other.x, ripples * 1.27, other.y);
        b = mix(left, b, smoothstep(-0.14, 0.14, u));
      }
      h = b.x * spread;
      slope = b.y * spread * dxds;
    } else {
      vec2 w = flow(band.z, t, band.y, fi);
      if (u_mix < 1.0) w = mix(flow(band.w, t, band.y, fi), w, u_mix);
      float amp = u_height * band.x * emph;
      h = amp * w.x;
      slope = amp * w.y / perim;
    }

    // Working: two comets chase around the outline, each band a step behind.
    if (u_orbit > 0.001) {
      float lag = fi * cw * 0.45 / perim;
      float d1 = abs(fract(t - head + lag + 0.5) - 0.5) * perim;
      float d2 = abs(fract(t - head + lag) - 0.5) * perim;
      float comet = exp(-d1 * d1 / (cw * cw)) + exp(-d2 * d2 / (cw * cw));
      h += u_height * 0.4 * u_orbit * comet;
    }

    // The crisp line, with a tight neon halo.
    float lineAt = u_gap + halfLine + h;
    float dist = abs(d - lineAt) / sqrt(1.0 + slope * slope);
    float core = clamp((halfLine - dist) / u_pxSize + 0.5, 0.0, 1.0);
    float neon = 0.1 * exp(-max(dist - halfLine, 0.0) / 2.5);

    // The aura: light under a lifted line, brightest just below it, and a
    // soft bloom beyond it. At rest a tight ring hugs the outline (on dark
    // backgrounds only; on light ones it would read as a shadow). The ring
    // falls off faster than the bloom, or it spreads into a grey panel.
    float lift = clamp(h / 5.0, 0.0, 1.0);
    float under = clamp((d - u_gap) / (h + halfLine + 0.001), 0.0, 1.0);
    float fill = d < lineAt ? pow(under, 1.5) * lift * 0.5 : 0.0;
    float spill = max(d - lineAt, 0.0) / u_glow;
    float halo = exp(-spill * (1.0 + 0.35 * spill));
    float bloom = (1.0 - u_lightMode) * 0.1 * halo + 0.28 * lift * exp(-spill);
    float aura = (fill + bloom) * u_aura;

    float amount = core + neon + aura;
    sum += u_colors[i] * amount;
    tint += u_colors[i] * amount * amount;
    tintWeight += amount * amount;
    clear *= 1.0 - clamp(core + neon * 0.3 + aura * mix(0.6, 1.1, u_lightMode), 0.0, 1.0);
  }

  // Everything fades out before the edge of the drawing, and before the edges
  // of the clip box, so it never ends in a hard line.
  float fade = exp(-max(d - u_gap, 0.0) / (u_height * 1.8 + u_glow * 3.0 + 16.0));
  float edge = 1.0 - smoothstep(reach * 0.5, reach, d);
  vec2 clipped = smoothstep(u_clip.xy, u_clip.xy + CLIP_FADE, px) * (1.0 - smoothstep(u_clip.zw - CLIP_FADE, u_clip.zw, px));
  float m = u_vis * fade * edge * clipped.x * clipped.y * smoothstep(-1.0, 0.0, d) * (0.3 + 0.7 * emph);
  if (u_lightMode < 0.5) {
    // Light adds up: overlapping bands get brighter and whiter.
    vec3 col = pow(min(sum * u_gain * m, vec3(1.0)), vec3(0.4545));
    gl_FragColor = vec4(col, max(col.r, max(col.g, col.b)));
  } else {
    // Paint: each pixel takes the colour of the bands that reach it most,
    // so a glow keeps the hue of its wave instead of averaging to grey.
    vec3 col = pow(tint / max(tintWeight, 1e-8), vec3(0.4545));
    float alpha = clamp((1.0 - clear) * u_gain, 0.0, 1.0) * m;
    gl_FragColor = vec4(col * alpha, alpha);
  }
}`;

const UNIFORMS = [
  "u_px", "u_size", "u_center", "u_half", "u_radius", "u_pradius", "u_inner", "u_time",
  "u_count", "u_band", "u_band2", "u_colors", "u_mix", "u_height", "u_line", "u_gap", "u_glow", "u_gain",
  "u_emph", "u_vis", "u_orbit", "u_lightMode", "u_layout", "u_specCenter", "u_span", "u_dir",
  "u_pxSize", "u_aura", "u_clip",
];

const DEFAULTS = {
  anchor: null, // Element, or null for the page edges
  levels: null, // () => ArrayLike<number>, band levels 0..1
  bands: 6,
  palette: "prism",
  layout: "mirror", // "mirror" | "linear" | "flow"
  placement: "top", // where the bands sit: "top" | "around" | "bottom"
  outline: "fade", // "fade": the outline fades away from the bands; "full": even all around
  height: 28, // px, the tallest a band can lift
  line: 1.6, // px
  gap: 1.5, // px between the element's edge and the resting line
  glow: 14, // px, how far the aura blooms past the lines
  aura: 1, // 0 crisp lines only, 1 lines with a soft aura, 2 lush
  blur: 0, // px, blurs the lines and their aura into a soft glow
  gain: 1,
  speed: 1,
  padding: 0, // px added around the anchor's box
  inside: false, // draw inward from the anchor's edges instead of outward
  radius: null, // px, overrides the anchor's border radius
  pageRadius: 0,
  clip: null, // Element whose box clips the glow, e.g. a scroll container
  quality: 1, // backing-store scale on top of devicePixelRatio
  mode: "auto", // "auto" | "dark" | "light"
  glide: 480, // ms to glide to a new anchor
  zIndex: 2147483000,
};

// Outline strength at the top, the sides and the bottom.
const EMPHASIS = {
  top: [1, 0.3, 0.05],
  around: [1, 1, 1],
  bottom: [0.05, 0.3, 1],
};

const LAYOUTS = { mirror: 0, linear: 1, flow: 2 };

// visibility, how much live levels move the lines, working orbit
const STATES = {
  hidden: [0, 0, 0],
  active: [1, 1, 0],
  working: [1, 0, 1],
  paused: [0.7, 0, 0],
};

const approach = (value, target, dt, tau) => value + (target - value) * (1 - Math.exp(-dt / tau));
const lerp = (a, b, k) => a + (b - a) * k;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`aura shader: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

export function createAura(options = {}) {
  const o = { ...DEFAULTS, ...options };
  const canvas = document.createElement("canvas");
  canvas.className = "ss-aura";
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    left: "0",
    top: "0",
    pointerEvents: "none",
    zIndex: String(o.zIndex),
    display: "none",
    filter: o.blur > 0 ? `blur(${o.blur}px)` : "",
  });

  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power",
  });

  let state = "hidden";
  if (!gl) {
    return {
      canvas,
      get state() {
        return state;
      },
      setState(next) {
        state = next;
      },
      setAnchor(el) {
        o.anchor = el;
      },
      setLevels(fn) {
        o.levels = fn;
      },
      setOptions(next) {
        Object.assign(o, next);
      },
      destroy() {},
    };
  }
  document.body.append(canvas);

  let u = {};
  function init() {
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`aura program: ${gl.getProgramInfoLog(program)}`);
    }
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    u = Object.fromEntries(UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)]));
  }
  init();

  let lost = false;
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    lost = true;
  });
  canvas.addEventListener("webglcontextrestored", () => {
    init();
    lost = false;
  });

  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const bands = new Float32Array(MAX_BANDS * 4); // level, phase, cycles, previous cycles
  const bands2 = new Float32Array(MAX_BANDS * 4); // the mirror's other half: level, phase
  const phases2 = new Float32Array(MAX_BANDS);
  const current = new Float32Array(MAX_BANDS);
  // Recent levels, so the other half of the mirror can show them a moment later.
  const history = Array.from({ length: 32 }, () => ({ t: -1e9, v: new Float32Array(MAX_BANDS) }));
  let historyAt = 0;
  const colorsDark = new Float32Array(MAX_BANDS * 3);
  const colorsLight = new Float32Array(MAX_BANDS * 3);
  const phases = new Float32Array(MAX_BANDS);
  const cycles = new Float32Array(MAX_BANDS).fill(1);
  const cyclesPrev = new Float32Array(MAX_BANDS).fill(1);
  let cyclePerim = 0;
  let cycleMix = 1;
  let cycleMixStart = 0;
  let forceCycles = false;

  let vis = 0;
  let act = 0;
  let orbit = 0;
  let time = Math.random() * 100;
  let raf = 0;
  let lastNow = 0;
  let lastRect = null;
  let glideFrom = null;
  let glideStart = 0;
  let mode = "";
  let modeCheckedAt = -1e9;
  let radii = new WeakMap();
  let boxW = 0;
  let boxH = 0;
  let clipCss = "";

  function rebuildPalette() {
    const pal = bandPalette(o.palette, o.bands);
    colorsDark.fill(0);
    colorsLight.fill(0);
    for (let i = 0; i < o.bands; i++) {
      colorsDark.set(pal.onDark[i], i * 3);
      colorsLight.set(pal.onLight[i], i * 3);
    }
  }
  rebuildPalette();

  function radiusOf(el, box) {
    if (o.radius != null) return o.radius;
    let r = radii.get(el);
    if (r == null) {
      const v = getComputedStyle(el).borderTopLeftRadius;
      r = v.endsWith("%") ? (parseFloat(v) / 100) * Math.min(box.width, box.height) : parseFloat(v) || 0;
      radii.set(el, r);
    }
    return r;
  }

  function measure(el) {
    const root = document.documentElement;
    if (!el) {
      return { x: 0, y: 0, w: root.clientWidth, h: root.clientHeight, r: o.pageRadius, page: true, inner: true };
    }
    const b = el.getBoundingClientRect();
    const pad = o.padding;
    const w = b.width + pad * 2;
    const h = b.height + pad * 2;
    const r = Math.max(0, Math.min(radiusOf(el, b) + pad, w / 2, h / 2));
    return { x: b.left - pad, y: b.top - pad, w, h, r, page: false, inner: !!o.inside };
  }

  function currentRect(now) {
    const to = measure(o.anchor);
    if (!glideFrom || reduced.matches) return to;
    const k = Math.min(1, (now - glideStart) / o.glide);
    if (k >= 1 || glideFrom.inner !== to.inner) {
      glideFrom = null;
      return to;
    }
    const e = 1 - (1 - k) ** 3;
    return {
      x: lerp(glideFrom.x, to.x, e),
      y: lerp(glideFrom.y, to.y, e),
      w: lerp(glideFrom.w, to.w, e),
      h: lerp(glideFrom.h, to.h, e),
      r: lerp(glideFrom.r, to.r, e),
      page: to.page,
      inner: to.inner,
    };
  }

  const heightOf = (rect) => o.height * (rect.page ? 1.7 : 1);
  const glowOf = (rect) => o.glow * (rect.page ? 1.6 : 1);
  const reachOf = (rect) => o.gap + o.line + heightOf(rect) * 1.3 + glowOf(rect) * 4 + 2;

  function perimeterOf(rect, pr) {
    return 2 * Math.max(0, rect.w - 2 * pr) + 2 * Math.max(0, rect.h - 2 * pr) + 2 * Math.PI * pr;
  }

  // Flow waves need a whole number of cycles around the outline to stay
  // seamless. When the outline changes a lot, crossfade to a new set.
  function updateCycles(rect, perim, now) {
    if (forceCycles || !cyclePerim || Math.abs(perim - cyclePerim) / cyclePerim > 0.3) {
      cyclesPrev.set(cycles);
      const scale = rect.page ? 1.8 : 1;
      for (let i = 0; i < MAX_BANDS; i++) {
        const f = o.bands > 1 ? i / (o.bands - 1) : 0;
        cycles[i] = Math.max(1, Math.round(perim / (380 * (70 / 380) ** f * scale)));
      }
      cycleMix = cyclePerim ? 0 : 1;
      cycleMixStart = now;
      cyclePerim = perim;
      forceCycles = false;
    }
    cycleMix = Math.min(1, (now - cycleMixStart) / 450);
  }

  // The stretch of outline that shows the spectrum, as fractions of the outline.
  function spectrumOf(rect, pr, perim) {
    if (o.placement === "around") return { center: 0, span: 0.5, dir: 1 };
    const edge = Math.max(0, rect.w / 2 - pr) + (Math.PI / 2) * pr * 0.6;
    const span = Math.min(0.5, Math.max(0.02, edge / perim));
    return o.placement === "bottom" ? { center: 0.5, span, dir: -1 } : { center: 0, span, dir: 1 };
  }

  function detectMode() {
    if (o.mode !== "auto") return o.mode;
    const probe = o.anchor?.isConnected ? o.anchor : document.documentElement;
    const v = getComputedStyle(probe).getPropertyValue("--aura-mode").trim();
    if (v === "light" || v === "dark") return v;
    const rgb = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g);
    if (!rgb) return "dark";
    const [r, g, b] = rgb.map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5 ? "light" : "dark";
  }

  function hide() {
    canvas.style.display = "none";
  }

  function draw(rect, pr, perim, breathe) {
    const root = document.documentElement;
    const vw = root.clientWidth;
    const vh = root.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = dpr * o.quality * (rect.page ? 0.75 : 1);
    let bx = 0;
    let by = 0;
    let bw = vw;
    let bh = vh;
    if (rect.inner && !rect.page) {
      const x0 = Math.max(0, Math.floor(rect.x));
      const y0 = Math.max(0, Math.floor(rect.y));
      const x1 = Math.min(vw, Math.ceil(rect.x + rect.w));
      const y1 = Math.min(vh, Math.ceil(rect.y + rect.h));
      if (x1 <= x0 || y1 <= y0) return hide();
      bx = x0;
      by = y0;
      bw = x1 - x0;
      bh = y1 - y0;
    } else if (!rect.inner) {
      const m = Math.ceil(reachOf(rect) + 2);
      const x0 = Math.max(-4, Math.floor(rect.x - m));
      const y0 = Math.max(-4, Math.floor(rect.y - m));
      const x1 = Math.min(vw + 4, Math.ceil(rect.x + rect.w + m));
      const y1 = Math.min(vh + 4, Math.ceil(rect.y + rect.h + m));
      if (x1 <= x0 || y1 <= y0) return hide();
      bx = x0;
      by = y0;
      bw = Math.ceil((x1 - x0) / 32) * 32;
      bh = Math.ceil((y1 - y0) / 32) * 32;
    }

    let clip = "none";
    let clipBox = [-1e6, -1e6, 1e6, 1e6];
    if (o.clip) {
      const c = o.clip.getBoundingClientRect();
      const top = Math.max(0, Math.round(c.top - by));
      const left = Math.max(0, Math.round(c.left - bx));
      const right = Math.max(0, Math.round(bx + bw - c.right));
      const bottom = Math.max(0, Math.round(by + bh - c.bottom));
      if (top + bottom >= bh || left + right >= bw) return hide();
      clip = `inset(${top}px ${right}px ${bottom}px ${left}px)`;
      clipBox = [c.left - bx, c.top - by, c.right - bx, c.bottom - by];
    }
    if (clip !== clipCss) {
      canvas.style.clipPath = clip;
      clipCss = clip;
    }

    canvas.style.display = "block";
    const pw = Math.max(1, Math.round(bw * scale));
    const ph = Math.max(1, Math.round(bh * scale));
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    if (bw !== boxW || bh !== boxH) {
      canvas.style.width = `${bw}px`;
      canvas.style.height = `${bh}px`;
      boxW = bw;
      boxH = bh;
    }
    canvas.style.transform = `translate(${bx}px, ${by}px)`;

    const e = o.outline === "full" ? EMPHASIS.around : (EMPHASIS[o.placement] ?? EMPHASIS.around);
    const spec = spectrumOf(rect, pr, perim);
    gl.viewport(0, 0, pw, ph);
    gl.uniform2f(u.u_px, pw, ph);
    gl.uniform2f(u.u_size, bw, bh);
    gl.uniform2f(u.u_center, rect.x + rect.w / 2 - bx, rect.y + rect.h / 2 - by);
    gl.uniform2f(u.u_half, rect.w / 2, rect.h / 2);
    gl.uniform1f(u.u_radius, rect.r);
    gl.uniform1f(u.u_pradius, pr);
    gl.uniform1f(u.u_inner, rect.inner ? 1 : 0);
    gl.uniform1f(u.u_time, time);
    gl.uniform1f(u.u_count, o.bands);
    gl.uniform4fv(u.u_band, bands);
    gl.uniform4fv(u.u_band2, bands2);
    gl.uniform3fv(u.u_colors, mode === "light" ? colorsLight : colorsDark);
    gl.uniform1f(u.u_mix, cycleMix);
    gl.uniform1f(u.u_height, heightOf(rect));
    gl.uniform1f(u.u_line, o.line);
    gl.uniform1f(u.u_gap, o.gap);
    gl.uniform1f(u.u_glow, Math.max(0.5, glowOf(rect)));
    gl.uniform1f(u.u_aura, o.aura);
    gl.uniform4f(u.u_clip, clipBox[0], clipBox[1], clipBox[2], clipBox[3]);
    gl.uniform1f(u.u_gain, o.gain * breathe);
    gl.uniform3f(u.u_emph, e[0], e[1], e[2]);
    gl.uniform1f(u.u_vis, vis);
    gl.uniform1f(u.u_orbit, orbit);
    gl.uniform1f(u.u_lightMode, mode === "light" ? 1 : 0);
    gl.uniform1f(u.u_layout, LAYOUTS[o.layout] ?? 0);
    gl.uniform1f(u.u_specCenter, spec.center);
    gl.uniform1f(u.u_span, spec.span);
    gl.uniform1f(u.u_dir, spec.dir);
    gl.uniform1f(u.u_pxSize, bw / pw);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(now) {
    raf = 0;
    const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 1 / 60;
    lastNow = now;
    const [tv, ta, to] = STATES[state];
    vis = approach(vis, tv, dt, tv > vis ? 0.14 : 0.24);
    act = approach(act, ta, dt, 0.12);
    orbit = approach(orbit, to, dt, 0.28);
    if (state === "hidden" && vis < 0.004) {
      vis = 0;
      lastNow = 0;
      hide();
      return;
    }
    raf = requestAnimationFrame(frame);
    if (lost) return;
    const motion = reduced.matches ? 0.12 : 1;
    time += dt * o.speed * motion;

    if (now - modeCheckedAt > 800) {
      modeCheckedAt = now;
      const next = detectMode();
      if (next !== mode) {
        mode = next;
        canvas.style.mixBlendMode = mode === "light" ? "normal" : "plus-lighter";
      }
    }

    // Lines move only while their band has energy, so the motion follows the voice.
    const src = o.levels?.();
    let sum = 0;
    for (let i = 0; i < MAX_BANDS; i++) {
      const level = src && i < o.bands ? (src[i] ?? 0) * act : 0;
      phases[i] += dt * o.speed * motion * (0.15 + 3.2 * level) * (i % 2 ? -1 : 1) * (1 + i * 0.25);
      bands[i * 4] = level;
      bands[i * 4 + 1] = phases[i];
      current[i] = level;
      sum += level;
    }
    const slot = history[historyAt];
    slot.t = now;
    slot.v.set(current);
    historyAt = (historyAt + 1) % history.length;
    let echo = current;
    let echoAt = -Infinity;
    for (const h of history) {
      if (h.t <= now - 80 && h.t > echoAt) {
        echo = h.v;
        echoAt = h.t;
      }
    }
    for (let i = 0; i < MAX_BANDS; i++) {
      phases2[i] += dt * o.speed * motion * (0.15 + 3.2 * echo[i]) * (i % 2 ? 1 : -1) * (1.1 + i * 0.2);
      bands2[i * 4] = echo[i];
      bands2[i * 4 + 1] = phases2[i];
    }
    const quiet = 1 - Math.min(1, (sum / o.bands) * 4);
    const breathe = 1 + 0.1 * Math.sin(now / 420) * quiet * act;

    const rect = currentRect(now);
    lastRect = rect;
    if (rect.w < 1 || rect.h < 1) return hide();
    const pr = rect.inner ? Math.max(rect.r, reachOf(rect)) : rect.r;
    const perim = perimeterOf(rect, pr);
    updateCycles(rect, perim, now);
    for (let i = 0; i < MAX_BANDS; i++) {
      bands[i * 4 + 2] = cycles[i];
      bands[i * 4 + 3] = cyclesPrev[i];
    }
    draw(rect, pr, perim, breathe);
  }

  function wake() {
    if (!raf) {
      lastNow = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  return {
    canvas,
    get state() {
      return state;
    },
    /** "hidden" | "active" (live levels) | "working" (orbit) | "paused" (resting line) */
    setState(next) {
      if (!STATES[next]) throw new Error(`aura: unknown state ${next}`);
      state = next;
      if (next !== "hidden") wake();
    },
    setAnchor(el, { glide = true } = {}) {
      if (el === o.anchor) return;
      glideFrom = glide && lastRect && vis > 0.02 && !!el === !!o.anchor ? lastRect : null;
      glideStart = performance.now();
      o.anchor = el;
      forceCycles = true;
      modeCheckedAt = -1e9;
    },
    setLevels(fn) {
      o.levels = fn;
    },
    setOptions(next) {
      const bandsChanged = "bands" in next && next.bands !== o.bands;
      Object.assign(o, next);
      canvas.style.filter = o.blur > 0 ? `blur(${o.blur}px)` : "";
      if (bandsChanged || "palette" in next) rebuildPalette();
      if (bandsChanged) forceCycles = true;
      radii = new WeakMap();
      modeCheckedAt = -1e9;
    },
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      canvas.remove();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
