import { describe, expect, it } from "vitest";
import { withQuery } from "./paths";

describe("withQuery", () => {
  it("adds fields and skips empty ones", () => {
    expect(withQuery("/a", { b: "1", c: "", d: null, e: undefined })).toBe("/a?b=1");
  });

  it("returns the bare path when nothing is left", () => {
    expect(withQuery("/a", { b: "" })).toBe("/a");
  });

  it("encodes values", () => {
    expect(withQuery("/a", { q: "x y&z" })).toBe("/a?q=x+y%26z");
  });
});
