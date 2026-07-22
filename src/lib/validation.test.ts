import { describe, expect, it } from "vitest";
import { isValidEmail } from "./validation";

describe("isValidEmail", () => {
  it("accepts a plausible work/university email", () => {
    expect(isValidEmail("dana.ruiz@wuwf.org")).toBe(true);
    expect(isValidEmail("m.bell@students.uwf.edu")).toBe(true);
  });

  it("rejects missing @ or domain", () => {
    expect(isValidEmail("dana.ruiz")).toBe(false);
    expect(isValidEmail("dana.ruiz@")).toBe(false);
    expect(isValidEmail("@wuwf.org")).toBe(false);
  });

  it("rejects empty or whitespace-only input", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("   ")).toBe(false);
  });

  it("trims surrounding whitespace before checking", () => {
    expect(isValidEmail("  dana.ruiz@wuwf.org  ")).toBe(true);
  });
});
