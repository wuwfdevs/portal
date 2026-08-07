import { describe, expect, it } from "vitest";
import { classifyNprAccess } from "./npr-access";

describe("classifyNprAccess", () => {
  it("is unmapped when the program has no NPR collection id, regardless of configuration", () => {
    expect(classifyNprAccess(null, true)).toEqual({ kind: "unmapped" });
    expect(classifyNprAccess(null, false)).toEqual({ kind: "unmapped" });
  });

  it("is not_configured when mapped but no CDS token exists", () => {
    expect(classifyNprAccess(3, false)).toEqual({ kind: "not_configured" });
  });

  it("is ready, carrying the collection id, when mapped and configured", () => {
    expect(classifyNprAccess(3, true)).toEqual({ kind: "ready", collectionId: 3 });
  });

  it("checks mapping before configuration — an unmapped program never becomes a config error", () => {
    expect(classifyNprAccess(null, false)).toEqual({ kind: "unmapped" });
  });
});
