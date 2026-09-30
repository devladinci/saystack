import { describe, expect, it } from "vitest";

import type { IAuraHost, IAuraRect, IAuraRendererOptions, IAuraView } from "../src/aura/renderer.js";
import { createAuraRenderer } from "../src/aura/renderer.js";
import type { IGlCall } from "./fakeGl.js";
import { createFakeGl } from "./fakeGl.js";

const RECT: IAuraRect = { x: -80, y: 0, w: 550, h: 1400, r: 44, isPage: false, isInner: true };

const VIEW: IAuraView = { x: 0, y: 0, width: 390, height: 140, pixelWidth: 780, pixelHeight: 280, clip: null };

const DENSE_VIEW: IAuraView = { ...VIEW, pixelWidth: 1170, pixelHeight: 420 };

interface IHostLog {
  hides: number;
}

const hostFor = (
  log: IHostLog,
  background: "dark" | "light" = "dark",
  rect: () => IAuraRect = () => RECT,
  view: IAuraView = VIEW,
): IAuraHost => ({
  background: () => background,
  target: rect,
  place: () => view,
  hide: () => {
    log.hides += 1;
  },
});

const setup = (options: Partial<IAuraRendererOptions> = {}) => {
  const { gl, calls } = createFakeGl();
  const renderer = createAuraRenderer(gl, {
    settings: { levels: () => [0.6, 0.9, 0.4, 0.8, 0.3, 0.5, 0.2], style: {}, gap: 0, glideMs: 480 },
    background: "dark",
    effects: "shader",
    ...options,
  });

  return { renderer, calls };
};

const framebuffers = (calls: IGlCall[]): unknown[] =>
  calls.filter((call) => call.name === "bindFramebuffer").map((call) => call.args[1]);

const uniform = (calls: IGlCall[], name: string): unknown[][] =>
  calls.filter((call) => call.name.startsWith("uniform") && call.args[0] === name).map((call) => call.args.slice(1));

describe("createAuraRenderer", () => {
  it("draws straight to the screen when the look needs no blur or scaling", () => {
    const { renderer, calls } = setup();
    renderer.setState("active");

    renderer.frame(1000, hostFor({ hides: 0 }));

    expect(framebuffers(calls)).toEqual([]);
    expect(calls.filter((call) => call.name === "drawArrays")).toHaveLength(1);
    expect(uniform(calls, "u_px")).toEqual([[780, 280]]);
  });

  it("draws at most two device pixels per point, like the web", () => {
    const { renderer, calls } = setup();
    renderer.setState("active");

    renderer.frame(
      1000,
      hostFor({ hides: 0 }, "dark", () => RECT, DENSE_VIEW),
    );

    expect(uniform(calls, "u_px")).toEqual([[780, 280]]);
    expect(uniform(calls, "u_sigma")).toEqual([[0]]);
    expect(uniform(calls, "u_out").at(-1)).toEqual([1170, 420]);
  });

  it("blurs in two passes at a lower resolution, then draws to the screen", () => {
    const { renderer, calls } = setup({ settings: { levels: null, style: { blur: 6 }, gap: 0, glideMs: 480 } });
    renderer.setState("active");

    renderer.frame(1000, hostFor({ hides: 0 }));

    const sigma = uniform(calls, "u_sigma").map(([value]) => value as number);
    const drawn = uniform(calls, "u_px")[0] as number[];

    expect(calls.filter((call) => call.name === "drawArrays")).toHaveLength(3);
    expect(framebuffers(calls).at(-1)).toBeNull();
    expect(sigma).toHaveLength(2);
    expect(sigma[0]).toBeCloseTo(2.5, 5);
    expect(sigma[1]).toBeCloseTo(2.5, 5);
    expect(drawn[0]).toBeLessThan(780 / 4);
    expect(uniform(calls, "u_out").at(-1)).toEqual([780, 280]);
  });

  it("renders a lower resolution offscreen and copies it up", () => {
    const { renderer, calls } = setup({ settings: { levels: null, style: { resolution: 0.5 }, gap: 0, glideMs: 480 } });
    renderer.setState("active");

    renderer.frame(1000, hostFor({ hides: 0 }));

    expect(uniform(calls, "u_px")).toEqual([[390, 140]]);
    expect(uniform(calls, "u_sigma")).toEqual([[0]]);
    expect(framebuffers(calls).at(-1)).toBeNull();
  });

  it("draws at a lower scale when the host asks for less", () => {
    const { renderer, calls } = setup();
    renderer.setState("active");
    renderer.setQuality(0.5);

    renderer.frame(1000, hostFor({ hides: 0 }));

    expect(uniform(calls, "u_px")).toEqual([[390, 140]]);
  });

  it("leaves blur and scaling to the host by default", () => {
    const { renderer, calls } = setup({
      effects: "host",
      settings: { levels: null, style: { blur: 6, resolution: 0.5 }, gap: 0, glideMs: 480 },
    });
    renderer.setState("active");

    renderer.frame(1000, hostFor({ hides: 0 }));

    expect(framebuffers(calls)).toEqual([]);
    expect(uniform(calls, "u_px")).toEqual([[780, 280]]);
  });

  it("gives out light without coverage on dark backgrounds, for hosts that add it up", () => {
    const additive = setup({ isAdditive: true });
    const plain = setup();
    additive.renderer.setState("active");
    plain.renderer.setState("active");

    additive.renderer.frame(1000, hostFor({ hides: 0 }, "dark"));
    additive.renderer.frame(1016, hostFor({ hides: 0 }, "light"));
    plain.renderer.frame(1000, hostFor({ hides: 0 }, "dark"));

    expect(uniform(additive.calls, "u_additive")).toEqual([[1], [0]]);
    expect(uniform(plain.calls, "u_additive")).toEqual([]);
  });

  it("stops asking for frames once it has faded out", () => {
    const { renderer } = setup();
    const log = { hides: 0 };
    const host = hostFor(log);
    renderer.setState("active");
    renderer.frame(1000, host);
    renderer.setState("hidden");

    const frames = Array.from({ length: 40 }, (_, index) => renderer.frame(1100 + index * 50, host));

    expect(frames.at(-1)).toBe(false);
    expect(log.hides).toBeGreaterThan(0);
  });

  it("glides from the last outline to a new one", () => {
    const { renderer, calls } = setup();
    let rect: IAuraRect = { x: 0, y: 0, w: 100, h: 40, r: 8, isPage: false, isInner: false };
    const host = hostFor({ hides: 0 }, "dark", () => rect);
    renderer.setState("active");

    for (let index = 0; index < 20; index += 1) {
      renderer.frame(1000 + index * 16, host);
    }

    rect = { ...rect, x: 200 };
    renderer.retarget(true, 1320);
    calls.length = 0;
    renderer.frame(1440, host);
    const [centerX] = uniform(calls, "u_center")[0] as number[];

    expect(centerX).toBeGreaterThan(50);
    expect(centerX).toBeLessThan(250);
  });
});
