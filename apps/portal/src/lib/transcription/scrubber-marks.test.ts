import { describe, expect, it } from "vitest";
import { mergeMarks, zoomWindowForBin } from "./scrubber-marks";

const range = (id: string, startMs: number, endMs: number) => ({ id, startMs, endMs });

describe("mergeMarks", () => {
  it("gives each excerpt its own mark when there are few", () => {
    const result = mergeMarks([range("a", 0, 10_000), range("b", 50_000, 60_000)], 100_000);
    expect(result).toEqual({
      mode: "marks",
      marks: [
        { id: "a", left: 0, width: 10 },
        { id: "b", left: 50, width: 10 },
      ],
    });
  });

  it("keeps a very short excerpt clickable and inside the strip", () => {
    const result = mergeMarks([range("a", 99_900, 100_000)], 100_000);
    if (result.mode !== "marks") throw new Error("expected marks");
    expect(result.marks[0]!.width).toBeGreaterThanOrEqual(0.7);
    expect(result.marks[0]!.left + result.marks[0]!.width).toBeLessThanOrEqual(100);
  });

  it("draws nothing without a duration or any excerpts", () => {
    expect(mergeMarks([], 100_000)).toEqual({ mode: "marks", marks: [] });
    expect(mergeMarks([range("a", 0, 1)], 0)).toEqual({ mode: "marks", marks: [] });
  });

  it("switches to a density strip past the limit, busiest stretch at full intensity", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      range(`c${i}`, i < 30 ? 1_000 : 90_000, 2_000),
    );
    const result = mergeMarks(many, 100_000, { maxMarks: 30, bins: 10 });
    if (result.mode !== "density") throw new Error("expected density");
    expect(result.bins).toHaveLength(10);
    expect(result.bins[0]).toMatchObject({ count: 30, intensity: 1 });
    expect(result.bins[9]).toMatchObject({ count: 10 });
    expect(result.bins[9]!.intensity).toBeCloseTo(1 / 3);
    expect(result.bins[5]).toMatchObject({ count: 0, intensity: 0, startMs: 50_000 });
  });
});

describe("mergeMarks in a zoomed window", () => {
  it("draws only the excerpts in view, positioned against the window", () => {
    const result = mergeMarks(
      [range("a", 0, 10_000), range("b", 50_000, 60_000), range("c", 90_000, 100_000)],
      100_000,
      { window: { startMs: 40_000, endMs: 80_000 } },
    );
    expect(result).toEqual({ mode: "marks", marks: [{ id: "b", left: 25, width: 25 }] });
  });

  it("clips an excerpt that runs past the window edge", () => {
    const result = mergeMarks([range("a", 30_000, 50_000)], 100_000, {
      window: { startMs: 40_000, endMs: 80_000 },
    });
    if (result.mode !== "marks") throw new Error("expected marks");
    expect(result.marks[0]).toMatchObject({ left: 0, width: 25 });
  });

  it("bins over the window, so zooming a dense stripe separates its excerpts", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      range(`c${i}`, 10_000 + i * 500, 10_400 + i * 500),
    );
    const whole = mergeMarks(many, 100_000, { maxMarks: 30, bins: 10 });
    expect(whole.mode).toBe("density");
    const zoomed = mergeMarks(many, 100_000, {
      maxMarks: 50,
      window: { startMs: 10_000, endMs: 30_000 },
    });
    expect(zoomed.mode).toBe("marks");
    if (whole.mode === "density")
      expect(whole.bins[1]).toMatchObject({ startMs: 10_000, endMs: 20_000 });
  });
});

describe("zoomWindowForBin", () => {
  const whole = { startMs: 0, endMs: 100_000 };

  it("centres a few bins on the one clicked", () => {
    expect(zoomWindowForBin({ startMs: 40_000, endMs: 50_000 }, whole)).toEqual({
      startMs: 30_000,
      endMs: 60_000,
    });
  });

  it("slides back inside the current view at either end", () => {
    expect(zoomWindowForBin({ startMs: 0, endMs: 10_000 }, whole)).toEqual({
      startMs: 0,
      endMs: 30_000,
    });
    expect(zoomWindowForBin({ startMs: 90_000, endMs: 100_000 }, whole)).toEqual({
      startMs: 70_000,
      endMs: 100_000,
    });
  });

  it("refuses a zoom that would not narrow the view", () => {
    expect(
      zoomWindowForBin(
        { startMs: 0, endMs: 40_000 },
        { startMs: 0, endMs: 100_000 },
        { spanBins: 3 },
      ),
    ).toBeNull();
  });
});
