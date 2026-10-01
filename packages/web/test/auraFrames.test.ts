import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IAura, IAuraOptions } from "../src/aura/createAura.js";
import { createAura } from "../src/aura/createAura.js";
import type { IFrameClock, IGlCall } from "./fakeGl.js";
import { createFakeGl, useFakeFrames } from "./fakeGl.js";

interface IBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface IFrame {
  calls: IGlCall[];
  canvas: Record<string, string | number>;
}

const LEVELS = [0.2, 0.85, 0.5, 0.95, 0.3, 0.6, 0.1, 0.4];

const boxed = (box: IBox): DOMRect =>
  ({
    ...box,
    x: box.left,
    y: box.top,
    right: box.left + box.width,
    bottom: box.top + box.height,
    toJSON: () => box,
  }) as DOMRect;

const element = (box: IBox, radius = ""): HTMLElement => {
  const node = document.createElement("div");
  node.style.borderRadius = radius;
  node.getBoundingClientRect = () => boxed(box);
  document.body.append(node);

  return node;
};

let calls: IGlCall[];
let clock: IFrameClock;

beforeEach(() => {
  const fake = createFakeGl();
  calls = fake.calls;
  clock = useFakeFrames();
  vi.stubGlobal("WebGLRenderingContext", class {});
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(420);
  vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(860);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(((kind: string) =>
    kind === "webgl" ? fake.gl : null) as HTMLCanvasElement["getContext"]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const canvasOf = (): HTMLCanvasElement => {
  const canvas = document.querySelector<HTMLCanvasElement>(".saystack-aura");

  if (canvas === null) {
    throw new Error("no aura canvas");
  }

  return canvas;
};

const frames = (count: number, ms = 16): IFrame[] =>
  Array.from({ length: count }, () => {
    calls.length = 0;
    clock.step(ms);
    const canvas = canvasOf();

    return {
      calls: calls.slice(),
      canvas: {
        width: canvas.width,
        height: canvas.height,
        display: canvas.style.display,
        transform: canvas.style.transform,
        cssWidth: canvas.style.width,
        cssHeight: canvas.style.height,
        clipPath: canvas.style.clipPath,
        filter: canvas.style.filter,
        blend: canvas.style.mixBlendMode,
        zIndex: canvas.style.zIndex,
      },
    };
  });

const start = (options: IAuraOptions): IAura => {
  const aura = createAura({ levels: () => LEVELS, ...options });
  aura.setState("active");

  return aura;
};

describe("createAura frames", () => {
  it("draws around an element on a dark page", () => {
    const aura = start({ anchor: element({ left: 40, top: 300, width: 320, height: 64 }), radius: 16, mode: "dark" });

    expect(frames(5)).toMatchSnapshot();
    aura.destroy();
  });

  it("hangs from the top edge of a wide box, clipped, on a light page", () => {
    const aura = start({
      anchor: element({ left: -80, top: 0, width: 580, height: 1400 }, "44px"),
      clip: element({ left: 0, top: -40, width: 420, height: 1100 }),
      isInside: true,
      gap: 0,
      mode: "light",
      zIndex: 25,
    });

    expect(frames(4)).toMatchSnapshot();
    aura.setState("working");
    expect(frames(3, 40)).toMatchSnapshot();
    aura.destroy();
  });

  it("outlines the page when there is no anchor", () => {
    const aura = start({ mode: "dark", pageRadius: 24 });

    aura.setState("paused");
    expect(frames(3)).toMatchSnapshot();
    aura.destroy();
  });

  it("glides to a new anchor and restyles", () => {
    const aura = start({ anchor: element({ left: 20, top: 100, width: 200, height: 48 }), mode: "dark" });

    frames(3);
    aura.setAnchor(element({ left: 60, top: 420, width: 280, height: 120 }));
    expect(frames(4, 60)).toMatchSnapshot();
    aura.update({
      padding: 12,
      style: { bands: 5, palette: "aurora", outline: "full", placement: "bottom", layout: "mirror", dark: { blur: 6 } },
    });
    expect(frames(3)).toMatchSnapshot();
    aura.destroy();
  });

  it("fades out and hides", () => {
    const aura = start({ anchor: element({ left: 40, top: 200, width: 300, height: 80 }), mode: "light" });

    frames(4);
    aura.setState("hidden");
    const fading = frames(12, 100);

    expect(fading.map((frame) => frame.canvas.display)).toMatchSnapshot();
    expect(fading[1]).toMatchSnapshot();
    aura.destroy();
  });
});
