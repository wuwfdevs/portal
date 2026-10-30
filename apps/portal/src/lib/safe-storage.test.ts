import { afterEach, describe, expect, it, vi } from "vitest";
import { safeGet, safeRemove, safeSet } from "./safe-storage";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("safe-storage", () => {
  it("round-trips in each area", () => {
    expect(safeSet("local", "k", "1")).toBe(true);
    expect(safeSet("session", "k", "2")).toBe(true);
    expect(safeGet("local", "k")).toBe("1");
    expect(safeGet("session", "k")).toBe("2");
    safeRemove("local", "k");
    expect(safeGet("local", "k")).toBeNull();
  });

  it("returns null for a missing key", () => {
    expect(safeGet("local", "missing")).toBeNull();
  });

  it("never throws when storage refuses", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(safeGet("local", "k")).toBeNull();
    expect(safeSet("local", "k", "v")).toBe(false);
    expect(() => safeRemove("session", "k")).not.toThrow();
  });
});
