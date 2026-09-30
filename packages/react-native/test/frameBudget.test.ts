import { describe, expect, it } from "vitest";

import { createFrameBudget } from "../src/aura/frameBudget.js";

describe("createFrameBudget", () => {
  it("keeps full quality where frames are cheap", () => {
    const budget = createFrameBudget();

    const waits = Array.from({ length: 60 }, () => budget.record(2));

    expect(budget.quality).toBe(1);
    expect(waits.every((wait) => wait === 0)).toBe(true);
  });

  it("ignores the first frames, where the shader compiles", () => {
    const budget = createFrameBudget();

    budget.record(2500);
    budget.record(2400);

    expect(budget.quality).toBe(1);
  });

  it("draws smaller until a frame fits, as the cost falls with the pixels", () => {
    const budget = createFrameBudget({ targetMs: 8 });
    const costAtFull = 130;

    for (let frame = 0; frame < 40; frame += 1) {
      budget.record(costAtFull * budget.quality ** 2);
    }

    expect(budget.quality).toBeLessThan(0.4);
    expect(budget.quality).toBeGreaterThan(0.2);
    expect(budget.record(costAtFull * budget.quality ** 2)).toBe(0);
  });

  it("rests between frames when even the smallest drawing is too slow", () => {
    const budget = createFrameBudget({ targetMs: 8, minQuality: 0.5 });

    let wait = 0;
    for (let frame = 0; frame < 30; frame += 1) {
      wait = budget.record(400 * budget.quality ** 2);
    }

    expect(budget.quality).toBe(0.5);
    expect(wait).toBeGreaterThan(100);
  });

  it("comes back up when frames get cheap again", () => {
    const budget = createFrameBudget({ targetMs: 8 });

    for (let frame = 0; frame < 20; frame += 1) {
      budget.record(130 * budget.quality ** 2);
    }

    const lowered = budget.quality;

    for (let frame = 0; frame < 80; frame += 1) {
      budget.record(1);
    }

    expect(lowered).toBeLessThan(1);
    expect(budget.quality).toBe(1);
  });
});
