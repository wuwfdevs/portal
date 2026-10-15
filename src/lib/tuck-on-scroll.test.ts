import { describe, expect, it } from "vitest";
import { nextTucked } from "./tuck-on-scroll";

describe("nextTucked", () => {
  it("tucks away when scrolling down past the top of the page", () => {
    expect(nextTucked(false, 200, 260)).toBe(true);
  });

  it("comes back when scrolling up", () => {
    expect(nextTucked(true, 600, 560)).toBe(false);
  });

  it("is always shown near the top", () => {
    expect(nextTucked(true, 300, 40)).toBe(false);
    expect(nextTucked(false, 0, 100)).toBe(false);
  });

  it("ignores a move smaller than the delta", () => {
    expect(nextTucked(true, 400, 404)).toBe(true);
    expect(nextTucked(false, 400, 396)).toBe(false);
  });
});
