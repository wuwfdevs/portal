import { describe, expect, it } from "vitest";
import {
  isPastLastPage,
  pageHref,
  pageInfo,
  pageNumbers,
  pageRange,
  parsePage,
} from "./pagination";

describe("parsePage", () => {
  it("reads a positive whole number and falls back to 1", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage(["4", "5"])).toBe(4);
    for (const raw of [undefined, "", "0", "-2", "1.5", "abc", "99999999999999999999"]) {
      expect(parsePage(raw)).toBe(1);
    }
  });
});

describe("pageRange", () => {
  it("is the inclusive range .range() takes", () => {
    expect(pageRange(1, 25)).toEqual({ from: 0, to: 24 });
    expect(pageRange(3, 10)).toEqual({ from: 20, to: 29 });
  });
});

describe("pageInfo", () => {
  it("says which rows are shown", () => {
    expect(pageInfo(2, 60, 25)).toMatchObject({ pageCount: 3, first: 26, last: 50 });
    expect(pageInfo(3, 60, 25)).toMatchObject({ first: 51, last: 60 });
    expect(pageInfo(1, 0, 25)).toMatchObject({ pageCount: 1, first: 0, last: 0 });
  });

  it("knows a page past the end", () => {
    expect(isPastLastPage(pageInfo(4, 60, 25))).toBe(true);
    expect(isPastLastPage(pageInfo(3, 60, 25))).toBe(false);
    expect(isPastLastPage(pageInfo(2, 0, 25))).toBe(false);
  });
});

describe("pageHref", () => {
  it("keeps the other parameters and makes page 1 the bare URL", () => {
    expect(pageHref("/resources", { area: "News", q: "", page: "4" }, 2)).toBe(
      "/resources?area=News&page=2",
    );
    expect(pageHref("/resources", { area: "News" }, 1)).toBe("/resources?area=News");
    expect(pageHref("/resources", {}, 1)).toBe("/resources");
  });
});

describe("pageNumbers", () => {
  it("lists every page when there are few", () => {
    expect(pageNumbers(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("elides the middle with gaps, never hiding a single page", () => {
    expect(pageNumbers(6, 12)).toEqual([1, null, 5, 6, 7, null, 12]);
    expect(pageNumbers(1, 12)).toEqual([1, 2, 3, 4, null, 12]);
    expect(pageNumbers(12, 12)).toEqual([1, null, 9, 10, 11, 12]);
    expect(pageNumbers(4, 12)).toEqual([1, 2, 3, 4, 5, null, 12]);
  });
});
