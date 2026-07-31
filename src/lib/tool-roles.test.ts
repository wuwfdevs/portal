import { describe, expect, it } from "vitest";
import { getRoleCatalog } from "./tool-roles";

describe("getRoleCatalog", () => {
  it("returns editorial planning's role options in rank order", () => {
    const catalog = getRoleCatalog("editorial-planning");
    expect(catalog?.map((option) => option.value)).toEqual(["contributor", "reviewer", "editor"]);
    expect(catalog?.every((option) => option.label && option.description)).toBe(true);
  });

  it("returns null for tools with no distinct roles", () => {
    expect(getRoleCatalog("transcription")).toBeNull();
    expect(getRoleCatalog("remote-interview")).toBeNull();
    expect(getRoleCatalog("audience-listening")).toBeNull();
    expect(getRoleCatalog("nonexistent-tool")).toBeNull();
  });
});
