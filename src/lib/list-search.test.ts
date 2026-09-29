import { describe, expect, it } from "vitest";
import { listSearchHref } from "./list-search";

describe("listSearchHref", () => {
  it("sets q and keeps the list's filters", () => {
    expect(listSearchHref("/log/library", { status: "approved" }, "promo")).toBe(
      "/log/library?status=approved&q=promo",
    );
  });

  it("drops q when the box is cleared, so the list resets", () => {
    expect(listSearchHref("/log/library", { status: "approved" }, "")).toBe(
      "/log/library?status=approved",
    );
    expect(listSearchHref("/log/library", undefined, "   ")).toBe("/log/library");
  });

  it("never carries a page number or a stale q", () => {
    expect(listSearchHref("/x", { page: "4", q: "old" }, "new")).toBe("/x?q=new");
  });

  it("trims the term", () => {
    expect(listSearchHref("/x", {}, "  fresh air ")).toBe("/x?q=fresh+air");
  });
});
