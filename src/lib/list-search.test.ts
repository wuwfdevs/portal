import { describe, expect, it } from "vitest";
import { likeTerm, listSearchHref, orIlike } from "./list-search";

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

describe("likeTerm", () => {
  it("strips wildcard and filter-syntax characters and tidies spacing", () => {
    expect(likeTerm("  50%_off ")).toBe("50 off");
    expect(likeTerm('a),b.eq.1,(c "d" \\')).toBe("a b.eq.1 c d");
  });

  it("is null when nothing searchable remains", () => {
    expect(likeTerm(null)).toBeNull();
    expect(likeTerm(undefined)).toBeNull();
    expect(likeTerm("  %_ ,() ")).toBeNull();
  });
});

describe("orIlike", () => {
  it("builds one ilike clause per column", () => {
    expect(orIlike(["title", "script"], "hello")).toBe("title.ilike.%hello%,script.ilike.%hello%");
  });

  it("cannot be used to add a clause", () => {
    expect(orIlike(["title"], "x),id.eq.1,(y")).toBe("title.ilike.%x id.eq.1 y%");
  });

  it("is null for an empty search", () => {
    expect(orIlike(["title"], " ")).toBeNull();
  });
});
