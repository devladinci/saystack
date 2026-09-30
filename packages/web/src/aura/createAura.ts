import type { AuraBackground, AuraState, IAuraHost, IAuraRect, IAuraRenderer, IAuraStyleOptions, IAuraView } from "@saystack/core";
import { createAuraRenderer } from "@saystack/core";

export type { AuraState };

export type AuraMode = "auto" | "dark" | "light";

export interface IAuraOptions {
  anchor?: Element | null;
  levels?: () => ArrayLike<number> | undefined;
  style?: IAuraStyleOptions;
  padding?: number;
  radius?: number;
  gap?: number;
  isInside?: boolean;
  clip?: Element | null;
  mode?: AuraMode;
  glideMs?: number;
  zIndex?: number;
  pageRadius?: number;
}

export interface IAuraAnchorOptions {
  isGliding?: boolean;
}

export interface IAura {
  readonly canvas: HTMLCanvasElement;
  readonly state: AuraState;
  setState(next: AuraState): void;
  setAnchor(anchor: Element | null, options?: IAuraAnchorOptions): void;
  update(options: Omit<IAuraOptions, "anchor">): void;
  destroy(): void;
}

interface ISettings {
  levels: (() => ArrayLike<number> | undefined) | null;
  style: IAuraStyleOptions;
  padding: number;
  radius: number | null;
  gap: number;
  isInside: boolean;
  clip: Element | null;
  mode: AuraMode;
  glideMs: number;
  zIndex: number;
  pageRadius: number;
}

let colorProbe: CanvasRenderingContext2D | null | undefined;

const luminanceOf = (color: string): number | null => {
  if (colorProbe === undefined) {
    colorProbe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  }

  if (colorProbe === null) {
    return null;
  }

  colorProbe.clearRect(0, 0, 1, 1);
  colorProbe.fillStyle = color;
  colorProbe.fillRect(0, 0, 1, 1);
  const [red = 0, green = 0, blue = 0, alpha = 0] = colorProbe.getImageData(0, 0, 1, 1).data;

  return alpha < 128 ? null : (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
};

const blurFilter = (blur: number): string => (blur > 0 ? `blur(${blur}px)` : "");

const mergeStyle = (previous: IAuraStyleOptions, next: IAuraStyleOptions): IAuraStyleOptions => ({
  ...previous,
  ...next,
  dark: { ...previous.dark, ...next.dark },
  light: { ...previous.light, ...next.light },
});

const backgroundOf = (mode: AuraMode): AuraBackground => (mode === "light" ? "light" : "dark");

function resolveSettings(options: IAuraOptions, previous?: ISettings): ISettings {
  const base = previous ?? {
    levels: null,
    style: {},
    padding: 0,
    radius: null,
    gap: 1.5,
    isInside: false,
    clip: null,
    mode: "auto",
    glideMs: 480,
    zIndex: 2147483000,
    pageRadius: 0,
  };

  return {
    levels: options.levels ?? base.levels,
    style: options.style === undefined ? base.style : mergeStyle(base.style, options.style),
    padding: options.padding ?? base.padding,
    radius: options.radius ?? base.radius,
    gap: options.gap ?? base.gap,
    isInside: options.isInside ?? base.isInside,
    clip: options.clip === undefined ? base.clip : options.clip,
    mode: options.mode ?? base.mode,
    glideMs: options.glideMs ?? base.glideMs,
    zIndex: options.zIndex ?? base.zIndex,
    pageRadius: options.pageRadius ?? base.pageRadius,
  };
}

const rendererSettings = ({ levels, style, gap, glideMs }: ISettings) => ({ levels, style, gap, glideMs });

function inertAura(canvas: HTMLCanvasElement, initial: AuraState): IAura {
  let state = initial;

  return {
    canvas,
    get state() {
      return state;
    },
    setState(next) {
      state = next;
    },
    setAnchor: () => undefined,
    update: () => undefined,
    destroy: () => undefined,
  };
}

export function createAura(options: IAuraOptions = {}): IAura {
  let settings = resolveSettings(options);
  let anchor = options.anchor ?? null;
  const canvas = document.createElement("canvas");
  canvas.className = "saystack-aura";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.position = "fixed";
  canvas.style.left = "0";
  canvas.style.top = "0";
  canvas.style.pointerEvents = "none";
  canvas.style.display = "none";
  canvas.style.zIndex = String(settings.zIndex);

  if (typeof WebGLRenderingContext === "undefined") {
    return inertAura(canvas, "hidden");
  }

  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power",
  });

  if (gl === null) {
    return inertAura(canvas, "hidden");
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let renderer: IAuraRenderer;

  try {
    renderer = createAuraRenderer(gl, {
      settings: rendererSettings(settings),
      background: backgroundOf(settings.mode),
      isReducedMotion: () => reducedMotion.matches,
    });
  } catch {
    return inertAura(canvas, "hidden");
  }

  document.body.append(canvas);

  let frame = 0;
  let mode: AuraBackground | null = null;
  let modeCheckedAt = -Infinity;
  let radii = new WeakMap<Element, number>();
  let boxWidth = 0;
  let boxHeight = 0;
  let clipPath = "";
  let filter = blurFilter(renderer.look.blur);
  canvas.style.filter = filter;

  const applyFilter = (): void => {
    const next = blurFilter(renderer.look.blur);

    if (next !== filter) {
      canvas.style.filter = next;
      filter = next;
    }
  };

  const handleContextLost = (event: Event): void => {
    event.preventDefault();
    renderer.lose();
  };

  const handleContextRestored = (): void => {
    renderer.restore();
  };

  canvas.addEventListener("webglcontextlost", handleContextLost);
  canvas.addEventListener("webglcontextrestored", handleContextRestored);

  const radiusOf = (element: Element, box: DOMRect): number => {
    if (settings.radius !== null) {
      return settings.radius;
    }

    const cached = radii.get(element);

    if (cached !== undefined) {
      return cached;
    }

    const value = getComputedStyle(element).borderTopLeftRadius;
    const radius = value.endsWith("%")
      ? (parseFloat(value) / 100) * Math.min(box.width, box.height)
      : parseFloat(value) || 0;
    radii.set(element, radius);

    return radius;
  };

  const measure = (element: Element | null): IAuraRect => {
    const root = document.documentElement;

    if (element === null) {
      return { x: 0, y: 0, w: root.clientWidth, h: root.clientHeight, r: settings.pageRadius, isPage: true, isInner: true };
    }

    const box = element.getBoundingClientRect();
    const pad = settings.padding;
    const w = box.width + pad * 2;
    const h = box.height + pad * 2;
    const r = Math.max(0, Math.min(radiusOf(element, box) + pad, w / 2, h / 2));

    return { x: box.left - pad, y: box.top - pad, w, h, r, isPage: false, isInner: settings.isInside };
  };

  const detectMode = (): AuraBackground => {
    if (settings.mode !== "auto") {
      return settings.mode;
    }

    const probe = anchor?.isConnected === true ? anchor : document.documentElement;
    const declared = getComputedStyle(probe).getPropertyValue("--saystack-aura-mode").trim();

    if (declared === "light" || declared === "dark") {
      return declared;
    }

    for (let element: Element | null = probe; element !== null; element = element.parentElement) {
      const luminance = luminanceOf(getComputedStyle(element).backgroundColor);

      if (luminance !== null) {
        return luminance > 0.5 ? "light" : "dark";
      }
    }

    const scheme = getComputedStyle(document.documentElement).colorScheme;

    if (scheme === "light" || scheme === "dark") {
      return scheme;
    }

    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  };

  const hide = (): void => {
    canvas.style.display = "none";
  };

  // The canvas covers only the outline and its glow, so a small outline stays cheap to draw.
  const place: IAuraHost["place"] = (rect, { reach, resolution }): IAuraView | null => {
    const root = document.documentElement;
    const viewportWidth = root.clientWidth;
    const viewportHeight = root.clientHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const scale = pixelRatio * resolution;
    let boxX = 0;
    let boxY = 0;
    let width = viewportWidth;
    let height = viewportHeight;

    if (rect.isInner && !rect.isPage) {
      const x0 = Math.max(0, Math.floor(rect.x));
      const y0 = Math.max(0, Math.floor(rect.y));
      const x1 = Math.min(viewportWidth, Math.ceil(rect.x + rect.w));
      const y1 = Math.min(viewportHeight, Math.ceil(rect.y + rect.h));

      if (x1 <= x0 || y1 <= y0) {
        return null;
      }

      boxX = x0;
      boxY = y0;
      width = x1 - x0;
      height = y1 - y0;
    } else if (!rect.isInner) {
      const margin = Math.ceil(reach + 2);
      const x0 = Math.max(-4, Math.floor(rect.x - margin));
      const y0 = Math.max(-4, Math.floor(rect.y - margin));
      const x1 = Math.min(viewportWidth + 4, Math.ceil(rect.x + rect.w + margin));
      const y1 = Math.min(viewportHeight + 4, Math.ceil(rect.y + rect.h + margin));

      if (x1 <= x0 || y1 <= y0) {
        return null;
      }

      boxX = x0;
      boxY = y0;
      width = Math.ceil((x1 - x0) / 32) * 32;
      height = Math.ceil((y1 - y0) / 32) * 32;
    }

    let nextClip = "none";
    let clip: IAuraView["clip"] = null;

    if (settings.clip !== null) {
      const limit = settings.clip.getBoundingClientRect();
      const top = Math.max(0, Math.round(limit.top - boxY));
      const left = Math.max(0, Math.round(limit.left - boxX));
      const right = Math.max(0, Math.round(boxX + width - limit.right));
      const bottom = Math.max(0, Math.round(boxY + height - limit.bottom));

      if (top + bottom >= height || left + right >= width) {
        return null;
      }

      nextClip = `inset(${top}px ${right}px ${bottom}px ${left}px)`;
      clip = [limit.left, limit.top, limit.right, limit.bottom];
    }

    if (nextClip !== clipPath) {
      canvas.style.clipPath = nextClip;
      clipPath = nextClip;
    }

    canvas.style.display = "block";
    applyFilter();
    const pixelWidth = Math.max(1, Math.round(width * scale));
    const pixelHeight = Math.max(1, Math.round(height * scale));

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    if (width !== boxWidth || height !== boxHeight) {
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      boxWidth = width;
      boxHeight = height;
    }

    canvas.style.transform = `translate(${boxX}px, ${boxY}px)`;

    return { x: boxX, y: boxY, width, height, pixelWidth, pixelHeight, clip };
  };

  const host: IAuraHost = {
    background: (now) => {
      if (now - modeCheckedAt > 800) {
        modeCheckedAt = now;
        const next = detectMode();

        if (next !== mode) {
          mode = next;
          canvas.style.mixBlendMode = mode === "light" ? "normal" : "plus-lighter";
        }
      }

      return mode ?? backgroundOf(settings.mode);
    },
    target: () => measure(anchor),
    place,
    hide,
  };

  const render = (now: number): void => {
    frame = 0;

    if (renderer.frame(now, host)) {
      frame = requestAnimationFrame(render);
    }
  };

  const wake = (): void => {
    if (frame === 0) {
      frame = requestAnimationFrame(render);
    }
  };

  return {
    canvas,
    get state() {
      return renderer.state;
    },
    setState(next) {
      renderer.setState(next);

      if (next !== "hidden") {
        wake();
      }
    },
    setAnchor(next, { isGliding = true } = {}) {
      if (next === anchor) {
        return;
      }

      renderer.retarget(isGliding && (next === null) === (anchor === null), performance.now());
      anchor = next;
      modeCheckedAt = -Infinity;
    },
    update(next) {
      const previous = settings;
      settings = resolveSettings(next, settings);
      canvas.style.zIndex = String(settings.zIndex);
      renderer.configure(rendererSettings(settings));
      applyFilter();

      if (previous.radius !== settings.radius || previous.padding !== settings.padding) {
        radii = new WeakMap();
      }

      if (previous.mode !== settings.mode) {
        modeCheckedAt = -Infinity;
      }
    },
    destroy() {
      cancelAnimationFrame(frame);
      frame = 0;
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      canvas.remove();
      renderer.dispose();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
