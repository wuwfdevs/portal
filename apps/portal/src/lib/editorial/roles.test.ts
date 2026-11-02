import { describe, expect, it } from "vitest";
import { normalizeToolRole, roleAtLeast } from "./roles";

describe("normalizeToolRole", () => {
  it("recognizes the canonical roles case-insensitively", () => {
    expect(normalizeToolRole("editor")).toBe("editor");
    expect(normalizeToolRole("Editor")).toBe("editor");
    expect(normalizeToolRole(" REVIEWER ")).toBe("reviewer");
  });

  it("falls back to contributor for null, empty, and unrecognized roles", () => {
    expect(normalizeToolRole(null)).toBe("contributor");
    expect(normalizeToolRole("")).toBe("contributor");
    expect(normalizeToolRole("Producer")).toBe("contributor");
  });
});

describe("roleAtLeast", () => {
  it("orders contributor < reviewer < editor", () => {
    expect(roleAtLeast("editor", "reviewer")).toBe(true);
    expect(roleAtLeast("reviewer", "reviewer")).toBe(true);
    expect(roleAtLeast("contributor", "reviewer")).toBe(false);
    expect(roleAtLeast("reviewer", "editor")).toBe(false);
    expect(roleAtLeast("contributor", "contributor")).toBe(true);
  });
});
