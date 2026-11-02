import { describe, expect, it } from "vitest";
import { backoffDelayMs } from "./backoff";

describe("backoffDelayMs", () => {
  const options = { baseMs: 1_000, capMs: 30_000 };

  it("doubles from the base and stops at the cap", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map((n) => backoffDelayMs(n, options))).toEqual([
      1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000,
    ]);
  });

  it("treats an attempt below one as the first", () => {
    expect(backoffDelayMs(0, options)).toBe(1_000);
    expect(backoffDelayMs(-3, options)).toBe(1_000);
  });
});
