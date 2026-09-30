import { bandPalette } from "./palette.js";
import { BLUR_FRAGMENT_SHADER, FRAGMENT_SHADER, MAX_BANDS, VERTEX_SHADER } from "./shaders.js";
import type { AuraBackground, AuraLayout, AuraPlacement, IAuraStyle, IAuraStyleOptions } from "./style.js";
import { auraStyleFor, resolveAuraStyle } from "./style.js";

export type AuraState = "hidden" | "active" | "working" | "paused";

// "host": the host blurs and scales the drawing (CSS on the web). "shader": the renderer does both itself.
export type AuraEffects = "host" | "shader";

export type AuraClip = readonly [left: number, top: number, right: number, bottom: number];

export interface IAuraRect {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  isPage: boolean;
  isInner: boolean;
}

export interface IAuraView {
  x: number;
  y: number;
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
  clip: AuraClip | null;
}

export interface IAuraFit {
  reach: number;
  resolution: number;
  look: IAuraStyle;
}

export interface IAuraHost {
  background(now: number): AuraBackground;
  target(): IAuraRect;
  place(rect: IAuraRect, fit: IAuraFit): IAuraView | null;
  hide(): void;
}

export interface IAuraSettings {
  levels: (() => ArrayLike<number> | undefined) | null;
  style: IAuraStyleOptions;
  gap: number;
  glideMs: number;
}

export interface IAuraRendererOptions {
  settings: IAuraSettings;
  background: AuraBackground;
  effects?: AuraEffects;
  isAdditive?: boolean;
  isReducedMotion?: () => boolean;
}

export interface IAuraRenderer {
  readonly state: AuraState;
  readonly look: IAuraStyle;
  setState(next: AuraState): void;
  configure(settings: IAuraSettings): void;
  // Scales the drawing down where the host finds the GPU too slow; only "shader" effects draw at a lower scale.
  setQuality(quality: number): void;
  retarget(isGliding: boolean, now: number): void;
  frame(now: number, host: IAuraHost): boolean;
  lose(): void;
  restore(): void;
  dispose(): void;
}

interface ISpectrum {
  center: number;
  span: number;
  dir: number;
}

interface ITarget {
  texture: WebGLTexture | null;
  buffer: WebGLFramebuffer | null;
  width: number;
  height: number;
}

type Uniforms = Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;

type BlurUniforms = Record<(typeof BLUR_UNIFORMS)[number], WebGLUniformLocation | null>;

interface IPrograms {
  aura: WebGLProgram;
  uniforms: Uniforms;
  blur: WebGLProgram | null;
  blurUniforms: BlurUniforms | null;
}

const UNIFORMS = [
  "u_px",
  "u_size",
  "u_center",
  "u_half",
  "u_radius",
  "u_pradius",
  "u_inner",
  "u_time",
  "u_count",
  "u_band",
  "u_band2",
  "u_colors",
  "u_mix",
  "u_height",
  "u_line",
  "u_gap",
  "u_glow",
  "u_gain",
  "u_emph",
  "u_vis",
  "u_orbit",
  "u_lightMode",
  "u_layout",
  "u_specCenter",
  "u_span",
  "u_dir",
  "u_pxSize",
  "u_aura",
  "u_clip",
  "u_additive",
] as const;

const BLUR_UNIFORMS = ["u_tex", "u_out", "u_step", "u_sigma"] as const;

const STATE_TARGETS: Readonly<Record<AuraState, readonly [number, number, number]>> = {
  hidden: [0, 0, 0],
  active: [1, 1, 0],
  working: [1, 0, 1],
  paused: [0.7, 0, 0],
};

const EMPHASIS: Readonly<Record<AuraPlacement, readonly [number, number, number]>> = {
  top: [1, 0.3, 0.05],
  around: [1, 1, 1],
  bottom: [0.05, 0.3, 1],
};

const LAYOUT_INDEX: Readonly<Record<AuraLayout, number>> = { mirror: 0, linear: 1, flow: 2 };

const PAGE_LIFT = 1.7;

const PAGE_GLOW = 1.6;

const ECHO_MS = 80;

const HISTORY_FRAMES = 32;

const NO_CLIP: AuraClip = [-1e6, -1e6, 1e6, 1e6];

// Like the web host, which draws at most two device pixels per CSS pixel.
const MAX_DENSITY = 2;

// Blurring is done at a lower resolution, where the kernel stays within a few texels.
const BLUR_TEXEL_SIGMA = 2.5;

const MIN_OFFSCREEN_SCALE = 1 / 16;

const approach = (value: number, target: number, dt: number, tau: number): number =>
  value + (target - value) * (1 - Math.exp(-dt / tau));

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);

  if (shader === null) {
    throw new Error("aura: could not create a shader");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`aura: ${gl.getShaderInfoLog(shader) ?? "shader did not compile"}`);
  }

  return shader;
}

function program(gl: WebGLRenderingContext, fragment: string): WebGLProgram {
  const created = gl.createProgram();

  if (created === null) {
    throw new Error("aura: could not create a program");
  }

  gl.attachShader(created, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(created, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(created);

  if (!gl.getProgramParameter(created, gl.LINK_STATUS)) {
    throw new Error(`aura: ${gl.getProgramInfoLog(created) ?? "program did not link"}`);
  }

  return created;
}

const locate = <T extends string>(
  gl: WebGLRenderingContext,
  target: WebGLProgram,
  names: readonly T[],
): Record<T, WebGLUniformLocation | null> =>
  Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(target, name)])) as Record<
    T,
    WebGLUniformLocation | null
  >;

const pointAt = (gl: WebGLRenderingContext, target: WebGLProgram): void => {
  const position = gl.getAttribLocation(target, "a_pos");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
};

function link(gl: WebGLRenderingContext, isBlurring: boolean): IPrograms {
  const aura = program(gl, FRAGMENT_SHADER);
  gl.useProgram(aura);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  pointAt(gl, aura);
  const uniforms = locate(gl, aura, UNIFORMS);

  if (!isBlurring) {
    return { aura, uniforms, blur: null, blurUniforms: null };
  }

  const blur = program(gl, BLUR_FRAGMENT_SHADER);

  return { aura, uniforms, blur, blurUniforms: locate(gl, blur, BLUR_UNIFORMS) };
}

const emptyTarget = (): ITarget => ({ texture: null, buffer: null, width: 0, height: 0 });

export function createAuraRenderer(
  gl: WebGLRenderingContext,
  {
    settings: initial,
    background: initialBackground,
    effects = "host",
    isAdditive = false,
    isReducedMotion = () => false,
  }: IAuraRendererOptions,
): IAuraRenderer {
  const isShaded = effects === "shader";
  let programs = link(gl, isShaded);
  let settings = initial;
  let background = initialBackground;
  const bands = new Float32Array(MAX_BANDS * 4);
  const echoBands = new Float32Array(MAX_BANDS * 4);
  const colorsOnDark = new Float32Array(MAX_BANDS * 3);
  const colorsOnLight = new Float32Array(MAX_BANDS * 3);
  const phases = new Float32Array(MAX_BANDS);
  const echoPhases = new Float32Array(MAX_BANDS);
  const current = new Float32Array(MAX_BANDS);
  const cycles = new Float32Array(MAX_BANDS).fill(1);
  const previousCycles = new Float32Array(MAX_BANDS).fill(1);
  const history = Array.from({ length: HISTORY_FRAMES }, () => ({
    at: -Infinity,
    levels: new Float32Array(MAX_BANDS),
  }));
  const scene = emptyTarget();
  const pass = emptyTarget();
  let historyIndex = 0;
  let cyclePerimeter = 0;
  let cycleMix = 1;
  let cycleMixStart = 0;
  let isCycleStale = false;
  let state: AuraState = "hidden";
  let visibility = 0;
  let activity = 0;
  let orbit = 0;
  let time = Math.random() * 100;
  let lastFrame = 0;
  let lastRect: IAuraRect | null = null;
  let glideFrom: IAuraRect | null = null;
  let glideStart = 0;
  let quality = 1;
  let isLost = false;

  const lookFor = (next: AuraBackground): IAuraStyle => resolveAuraStyle(auraStyleFor(settings.style, next));

  let look = lookFor(background);

  const rebuildPalette = (): void => {
    const palette = bandPalette(look.palette, look.bands);
    colorsOnDark.fill(0);
    colorsOnLight.fill(0);
    palette.onDark.forEach((color, index) => colorsOnDark.set(color, index * 3));
    palette.onLight.forEach((color, index) => colorsOnLight.set(color, index * 3));
  };

  rebuildPalette();

  const applyLook = (): void => {
    const previous = look;
    look = lookFor(background);

    if (previous.palette !== look.palette || previous.bands !== look.bands) {
      rebuildPalette();
    }

    if (previous.bands !== look.bands) {
      isCycleStale = true;
    }
  };

  const follow = (now: number, target: IAuraRect): IAuraRect => {
    if (glideFrom === null || isReducedMotion()) {
      return target;
    }

    const progress = Math.min(1, (now - glideStart) / settings.glideMs);

    if (progress >= 1 || glideFrom.isInner !== target.isInner) {
      glideFrom = null;
      return target;
    }

    const eased = 1 - (1 - progress) ** 3;

    return {
      x: lerp(glideFrom.x, target.x, eased),
      y: lerp(glideFrom.y, target.y, eased),
      w: lerp(glideFrom.w, target.w, eased),
      h: lerp(glideFrom.h, target.h, eased),
      r: lerp(glideFrom.r, target.r, eased),
      isPage: target.isPage,
      isInner: target.isInner,
    };
  };

  const liftOf = (rect: IAuraRect): number => look.lift * (rect.isPage ? PAGE_LIFT : 1);

  const glowOf = (rect: IAuraRect): number => look.auraSize * (rect.isPage ? PAGE_GLOW : 1);

  const reachOf = (rect: IAuraRect): number =>
    settings.gap + look.lineWidth + liftOf(rect) * 1.3 + glowOf(rect) * 4 + 2;

  const perimeterOf = (rect: IAuraRect, radius: number): number =>
    2 * Math.max(0, rect.w - 2 * radius) + 2 * Math.max(0, rect.h - 2 * radius) + 2 * Math.PI * radius;

  // Flow waves need a whole number of cycles around the outline to stay seamless.
  const updateCycles = (rect: IAuraRect, perimeter: number, now: number): void => {
    const hasChanged = cyclePerimeter === 0 || Math.abs(perimeter - cyclePerimeter) / cyclePerimeter > 0.3;

    if (isCycleStale || hasChanged) {
      previousCycles.set(cycles);
      const scale = rect.isPage ? 1.8 : 1;

      for (let index = 0; index < MAX_BANDS; index += 1) {
        const share = look.bands > 1 ? index / (look.bands - 1) : 0;
        cycles[index] = Math.max(1, Math.round(perimeter / (380 * (70 / 380) ** share * scale)));
      }

      cycleMix = cyclePerimeter === 0 ? 1 : 0;
      cycleMixStart = now;
      cyclePerimeter = perimeter;
      isCycleStale = false;
    }

    cycleMix = Math.min(1, (now - cycleMixStart) / 450);
  };

  const spectrumOf = (rect: IAuraRect, radius: number, perimeter: number): ISpectrum => {
    if (look.placement === "around") {
      return { center: 0, span: 0.5, dir: 1 };
    }

    const edge = Math.max(0, rect.w / 2 - radius) + (Math.PI / 2) * radius * 0.6;
    const span = Math.min(0.5, Math.max(0.02, edge / perimeter));

    return look.placement === "bottom" ? { center: 0.5, span, dir: -1 } : { center: 0, span, dir: 1 };
  };

  const recordLevels = (now: number, dt: number, motion: number): void => {
    const source = settings.levels?.();
    const speed = look.rippleSpeed * motion;

    for (let index = 0; index < MAX_BANDS; index += 1) {
      const level = source !== undefined && index < look.bands ? (source[index] ?? 0) * activity : 0;
      phases[index] =
        (phases[index] ?? 0) + dt * speed * (0.15 + 3.2 * level) * (index % 2 === 1 ? -1 : 1) * (1 + index * 0.25);
      bands[index * 4] = level;
      bands[index * 4 + 1] = phases[index] ?? 0;
      current[index] = level;
    }

    const slot = history[historyIndex];

    if (slot !== undefined) {
      slot.at = now;
      slot.levels.set(current);
    }

    historyIndex = (historyIndex + 1) % HISTORY_FRAMES;

    let echo = current;
    let echoAt = -Infinity;

    for (const entry of history) {
      if (entry.at <= now - ECHO_MS && entry.at > echoAt) {
        echo = entry.levels;
        echoAt = entry.at;
      }
    }

    for (let index = 0; index < MAX_BANDS; index += 1) {
      const level = echo[index] ?? 0;
      echoPhases[index] =
        (echoPhases[index] ?? 0) + dt * speed * (0.15 + 3.2 * level) * (index % 2 === 1 ? 1 : -1) * (1.1 + index * 0.2);
      echoBands[index * 4] = level;
      echoBands[index * 4 + 1] = echoPhases[index] ?? 0;
    }
  };

  const loudness = (): number => {
    let sum = 0;

    for (let index = 0; index < look.bands; index += 1) {
      sum += current[index] ?? 0;
    }

    return sum / Math.max(1, look.bands);
  };

  const releaseTarget = (target: ITarget): void => {
    if (target.texture !== null) {
      gl.deleteTexture(target.texture);
    }

    if (target.buffer !== null) {
      gl.deleteFramebuffer(target.buffer);
    }

    Object.assign(target, emptyTarget());
  };

  const sizeTarget = (target: ITarget, width: number, height: number): void => {
    if (target.texture !== null && target.width === width && target.height === height) {
      return;
    }

    releaseTarget(target);
    target.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    target.buffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.buffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);
    target.width = width;
    target.height = height;
  };

  const drawAura = (
    view: IAuraView,
    rect: IAuraRect,
    radius: number,
    perimeter: number,
    breathe: number,
    pixelWidth: number,
    pixelHeight: number,
  ): void => {
    const { uniforms } = programs;
    const isLight = background === "light";
    const emphasis = look.outline === "full" ? EMPHASIS.around : EMPHASIS[look.placement];
    const spectrum = spectrumOf(rect, radius, perimeter);
    const clip =
      view.clip === null
        ? NO_CLIP
        : [view.clip[0] - view.x, view.clip[1] - view.y, view.clip[2] - view.x, view.clip[3] - view.y];

    gl.viewport(0, 0, pixelWidth, pixelHeight);
    gl.uniform2f(uniforms.u_px, pixelWidth, pixelHeight);
    gl.uniform2f(uniforms.u_size, view.width, view.height);
    gl.uniform2f(uniforms.u_center, rect.x + rect.w / 2 - view.x, rect.y + rect.h / 2 - view.y);
    gl.uniform2f(uniforms.u_half, rect.w / 2, rect.h / 2);
    gl.uniform1f(uniforms.u_radius, rect.r);
    gl.uniform1f(uniforms.u_pradius, radius);
    gl.uniform1f(uniforms.u_inner, rect.isInner ? 1 : 0);
    gl.uniform1f(uniforms.u_time, time);
    gl.uniform1f(uniforms.u_count, look.bands);
    gl.uniform4fv(uniforms.u_band, bands);
    gl.uniform4fv(uniforms.u_band2, echoBands);
    gl.uniform3fv(uniforms.u_colors, isLight ? colorsOnLight : colorsOnDark);
    gl.uniform1f(uniforms.u_mix, cycleMix);
    gl.uniform1f(uniforms.u_height, liftOf(rect));
    gl.uniform1f(uniforms.u_line, look.lineWidth);
    gl.uniform1f(uniforms.u_gap, settings.gap);
    gl.uniform1f(uniforms.u_glow, Math.max(0.5, glowOf(rect)));
    gl.uniform1f(uniforms.u_gain, look.brightness * breathe);
    gl.uniform3f(uniforms.u_emph, emphasis[0], emphasis[1], emphasis[2]);
    gl.uniform1f(uniforms.u_vis, visibility);
    gl.uniform1f(uniforms.u_orbit, orbit);
    gl.uniform1f(uniforms.u_lightMode, isLight ? 1 : 0);
    gl.uniform1f(uniforms.u_layout, LAYOUT_INDEX[look.layout]);
    gl.uniform1f(uniforms.u_specCenter, spectrum.center);
    gl.uniform1f(uniforms.u_span, spectrum.span);
    gl.uniform1f(uniforms.u_dir, spectrum.dir);
    gl.uniform1f(uniforms.u_pxSize, view.width / pixelWidth);
    gl.uniform1f(uniforms.u_aura, look.aura);
    gl.uniform4f(uniforms.u_clip, clip[0] ?? 0, clip[1] ?? 0, clip[2] ?? 0, clip[3] ?? 0);

    if (isAdditive) {
      gl.uniform1f(uniforms.u_additive, isLight ? 0 : 1);
    }

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const blurInto = (
    source: ITarget,
    target: ITarget | null,
    step: readonly [number, number],
    sigma: number,
    view: IAuraView,
  ): void => {
    const { blur, blurUniforms } = programs;

    if (blur === null || blurUniforms === null) {
      return;
    }

    const width = target === null ? view.pixelWidth : target.width;
    const height = target === null ? view.pixelHeight : target.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target === null ? null : target.buffer);
    gl.viewport(0, 0, width, height);
    gl.useProgram(blur);
    pointAt(gl, blur);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source.texture);
    gl.uniform1i(blurUniforms.u_tex, 0);
    gl.uniform2f(blurUniforms.u_out, width, height);
    gl.uniform2f(blurUniforms.u_step, step[0], step[1]);
    gl.uniform1f(blurUniforms.u_sigma, sigma);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const draw = (view: IAuraView, rect: IAuraRect, radius: number, perimeter: number, breathe: number): void => {
    const density = view.pixelWidth / Math.max(1, view.width);
    const sigma = isShaded ? look.blur * density : 0;
    const resolution = isShaded
      ? look.resolution * (rect.isPage ? 0.75 : 1) * Math.min(1, MAX_DENSITY / density) * quality
      : 1;
    const scale = Math.max(
      MIN_OFFSCREEN_SCALE,
      sigma > 0 ? Math.min(resolution, BLUR_TEXEL_SIGMA / sigma) : resolution,
    );

    if (!isShaded || (sigma === 0 && resolution === 1)) {
      drawAura(view, rect, radius, perimeter, breathe, view.pixelWidth, view.pixelHeight);
      return;
    }

    const width = Math.max(1, Math.round(view.pixelWidth * scale));
    const height = Math.max(1, Math.round(view.pixelHeight * scale));
    sizeTarget(scene, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, scene.buffer);
    gl.useProgram(programs.aura);
    pointAt(gl, programs.aura);
    drawAura(view, rect, radius, perimeter, breathe, width, height);

    if (sigma === 0) {
      blurInto(scene, null, [0, 0], 0, view);
      gl.useProgram(programs.aura);
      return;
    }

    sizeTarget(pass, width, height);
    blurInto(scene, pass, [1 / width, 0], sigma * scale, view);
    blurInto(pass, null, [0, 1 / height], sigma * scale, view);
    gl.useProgram(programs.aura);
    pointAt(gl, programs.aura);
  };

  return {
    get state() {
      return state;
    },
    get look() {
      return look;
    },
    setState(next) {
      state = next;
    },
    configure(next) {
      settings = next;
      applyLook();
    },
    setQuality(next) {
      quality = Math.min(1, Math.max(MIN_OFFSCREEN_SCALE, next));
    },
    retarget(isGliding, now) {
      glideFrom = isGliding && lastRect !== null && visibility > 0.02 ? lastRect : null;
      glideStart = now;
      isCycleStale = true;
    },
    frame(now, host) {
      const dt = lastFrame === 0 ? 1 / 60 : Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;
      const [targetVisibility, targetActivity, targetOrbit] = STATE_TARGETS[state];
      visibility = approach(visibility, targetVisibility, dt, targetVisibility > visibility ? 0.14 : 0.24);
      activity = approach(activity, targetActivity, dt, 0.12);
      orbit = approach(orbit, targetOrbit, dt, 0.28);

      if (state === "hidden" && visibility < 0.004) {
        visibility = 0;
        lastFrame = 0;
        host.hide();
        return false;
      }

      if (isLost) {
        return true;
      }

      const motion = isReducedMotion() ? 0.12 : 1;
      time += dt * motion;
      const nextBackground = host.background(now);

      if (nextBackground !== background) {
        background = nextBackground;
        applyLook();
      }

      recordLevels(now, dt, motion);
      const quiet = 1 - Math.min(1, loudness() * 4);
      const breathe = 1 + 0.1 * Math.sin(now / 420) * quiet * activity;
      const rect = follow(now, host.target());
      lastRect = rect;

      if (rect.w < 1 || rect.h < 1) {
        host.hide();
        return true;
      }

      const radius = rect.isInner ? Math.max(rect.r, reachOf(rect)) : rect.r;
      const perimeter = perimeterOf(rect, radius);
      updateCycles(rect, perimeter, now);

      for (let index = 0; index < MAX_BANDS; index += 1) {
        bands[index * 4 + 2] = cycles[index] ?? 1;
        bands[index * 4 + 3] = previousCycles[index] ?? 1;
      }

      const view = host.place(rect, {
        reach: reachOf(rect),
        resolution: look.resolution * (rect.isPage ? 0.75 : 1),
        look,
      });

      if (view === null) {
        host.hide();
        return true;
      }

      draw(view, rect, radius, perimeter, breathe);

      return true;
    },
    lose() {
      isLost = true;
    },
    restore() {
      Object.assign(scene, emptyTarget());
      Object.assign(pass, emptyTarget());
      programs = link(gl, isShaded);
      isLost = false;
    },
    dispose() {
      releaseTarget(scene);
      releaseTarget(pass);
      gl.deleteProgram(programs.aura);

      if (programs.blur !== null) {
        gl.deleteProgram(programs.blur);
      }
    },
  };
}
