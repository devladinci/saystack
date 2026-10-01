import type { IAuraStyle } from "@saystack/core";
import { bandPalette, resolveAuraStyle } from "@saystack/core";

export type SpectrumLineState = "still" | "live" | "working";

export interface ISpectrumLineOptions {
  levels?: () => ArrayLike<number> | undefined;
  style?: Partial<IAuraStyle>;
}

export interface ISpectrumLine {
  setState(next: SpectrumLineState): void;
  update(options: ISpectrumLineOptions): void;
  destroy(): void;
}

const MAX_BANDS = 8;

const REST_COLOR = "rgb(140 146 156)";

export function createSpectrumLine(canvas: HTMLCanvasElement, options: ISpectrumLineOptions = {}): ISpectrumLine {
  const context = canvas.getContext("2d");
  const right = new Float32Array(MAX_BANDS);
  const left = new Float32Array(MAX_BANDS);
  let levels = options.levels ?? null;
  let style = resolveAuraStyle(options.style);
  let palette = bandPalette(style.palette, style.bands);
  let state: SpectrumLineState = "still";
  let frame = 0;
  let lastFrame = 0;
  let work = 0;
  let isLight = false;
  let modeCheckedAt = -Infinity;

  const draw = (now: number): boolean => {
    if (context === null) {
      return false;
    }

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (width === 0 || height === 0) {
      return false;
    }

    const dt = lastFrame === 0 ? 1 / 60 : Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    if (canvas.width !== Math.round(width * pixelRatio) || canvas.height !== Math.round(height * pixelRatio)) {
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
    }

    if (now - modeCheckedAt > 600) {
      modeCheckedAt = now;
      isLight = getComputedStyle(canvas).getPropertyValue("--saystack-aura-mode").trim() === "light";
    }

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.lineWidth = Math.max(1, style.lineWidth * 0.85);
    context.lineJoin = "round";

    const colors = isLight ? palette.cssLight : palette.css;
    const source = state === "live" ? levels?.() : undefined;
    work += ((state === "working" ? 1 : 0) - work) * (1 - Math.exp(-dt / 0.2));
    const head = ((now / 1000) * 0.9) % 1.3;
    const middle = height / 2;
    const room = middle - 2;
    const spacing = 0.92 / colors.length;
    const sigma = spacing * 0.72;
    let energy = work;

    if (isLight) {
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 1;
      context.strokeStyle = REST_COLOR;
      context.beginPath();
      context.moveTo(0, middle);
      context.lineTo(width, middle);
      context.stroke();
    } else {
      context.globalCompositeOperation = "lighter";
    }

    colors.forEach((color, index) => {
      const target = source?.[index] ?? 0;
      right[index] = (right[index] ?? 0) + (target - (right[index] ?? 0)) * (1 - Math.exp(-dt / 0.04));
      left[index] = (left[index] ?? 0) + (target - (left[index] ?? 0)) * (1 - Math.exp(-dt / 0.12));
      energy += (right[index] ?? 0) + (left[index] ?? 0);

      const centre = (index + 0.5) * spacing;
      const shift = spacing * 0.22 * Math.sin(index * 2.61 + 1.3);
      const lifts: number[] = [];
      let peak = 0;

      for (let x = 0; x <= width; x += 1) {
        const u = (x / width) * 2 - 1;
        const distance = Math.abs(u);
        const weight = Math.min(1, Math.max(0, (u + 0.14) / 0.28));
        const zRight = (distance - centre) / sigma;
        const zLeft = (distance - centre - shift) / (sigma * 0.86);
        const band =
          (right[index] ?? 0) * Math.exp(-zRight * zRight) * weight +
          (left[index] ?? 0) * Math.exp(-zLeft * zLeft) * (1 - weight);
        const sweep = work * Math.exp(-(((distance - head + index * 0.04) / 0.1) ** 2)) * 0.55;
        const lift = Math.min(1, band + sweep) * room;
        lifts.push(lift);
        peak = Math.max(peak, lift);
      }

      context.globalAlpha = isLight ? Math.min(1, peak / 2) : 1;

      if (context.globalAlpha < 0.02) {
        return;
      }

      context.strokeStyle = color;

      for (const sign of [-1, 1]) {
        context.beginPath();
        lifts.forEach((lift, x) => {
          if (x === 0) {
            context.moveTo(x, middle + sign * lift);
          } else {
            context.lineTo(x, middle + sign * lift);
          }
        });
        context.stroke();
      }
    });

    context.globalAlpha = 1;

    return state !== "still" || energy > 0.002;
  };

  const loop = (now: number): void => {
    frame = 0;

    if (draw(now)) {
      frame = requestAnimationFrame(loop);
    } else {
      lastFrame = 0;
    }
  };

  const wake = (): void => {
    if (frame === 0) {
      frame = requestAnimationFrame(loop);
    }
  };

  wake();

  return {
    setState(next) {
      state = next;
      wake();
    },
    update(next) {
      if (next.levels !== undefined) {
        levels = next.levels;
      }

      if (next.style !== undefined) {
        style = resolveAuraStyle({ ...style, ...next.style });
        palette = bandPalette(style.palette, style.bands);
      }

      wake();
    },
    destroy() {
      cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}
