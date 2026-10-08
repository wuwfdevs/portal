import { describe, expect, it } from "vitest";
import { mergeMarks } from "./scrubber-marks";

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
