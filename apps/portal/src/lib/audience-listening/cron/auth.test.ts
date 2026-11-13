import { describe, expect, it } from "vitest";
import { isCronAuthorized } from "./auth";

const SECRET = "s".repeat(32);

describe("isCronAuthorized", () => {
  it("accepts exactly the bearer secret", () => {
    expect(isCronAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });
  it("refuses a wrong, missing or differently-shaped header", () => {
    expect(isCronAuthorized(`Bearer ${"t".repeat(32)}`, SECRET)).toBe(false);
    expect(isCronAuthorized(SECRET, SECRET)).toBe(false);
    expect(isCronAuthorized(`bearer ${SECRET}`, SECRET)).toBe(false);
    expect(isCronAuthorized(null, SECRET)).toBe(false);
    expect(isCronAuthorized("", SECRET)).toBe(false);
  });
  it("authorizes nothing when no secret, or a weak one, is configured", () => {
    expect(isCronAuthorized("Bearer ", "")).toBe(false);
    expect(isCronAuthorized("Bearer undefined", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer short", "short")).toBe(false);
  });
});
