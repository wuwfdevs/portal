import { describe, expect, it } from "vitest";
import {
  filterEligibleContent,
  isContentItemEligibleForSlot,
  type EligibilityContentItemLike,
} from "./rundown-eligibility";

function item(overrides: Partial<EligibilityContentItemLike> = {}): EligibilityContentItemLike {
  return {
    content_type: "psa",
    approval_status: "approved",
    effective_from: "2026-01-01",
    effective_to: null,
    ...overrides,
  };
}

const SLOT = { permitted_content_types: ["legal_id", "station_promo", "psa"] };

describe("isContentItemEligibleForSlot", () => {
  it("accepts an approved item whose content type is permitted", () => {
    expect(isContentItemEligibleForSlot(item(), SLOT, "2026-08-07")).toBe(true);
  });

  it("rejects a draft or retired item", () => {
    expect(isContentItemEligibleForSlot(item({ approval_status: "draft" }), SLOT, "2026-08-07")).toBe(false);
    expect(isContentItemEligibleForSlot(item({ approval_status: "retired" }), SLOT, "2026-08-07")).toBe(false);
  });

  it("rejects a content type the slot doesn't permit", () => {
    expect(isContentItemEligibleForSlot(item({ content_type: "news" }), SLOT, "2026-08-07")).toBe(false);
  });

  it("rejects an item not yet effective", () => {
    expect(isContentItemEligibleForSlot(item({ effective_from: "2026-09-01" }), SLOT, "2026-08-07")).toBe(false);
  });

  it("rejects an item whose effective_to has passed", () => {
    expect(isContentItemEligibleForSlot(item({ effective_to: "2026-08-01" }), SLOT, "2026-08-07")).toBe(false);
  });

  it("accepts an item on the boundary dates", () => {
    expect(isContentItemEligibleForSlot(item({ effective_from: "2026-08-07" }), SLOT, "2026-08-07")).toBe(true);
    expect(isContentItemEligibleForSlot(item({ effective_to: "2026-08-07" }), SLOT, "2026-08-07")).toBe(true);
  });
});

describe("filterEligibleContent", () => {
  it("keeps only eligible items, preserving order", () => {
    const items = [
      item({ content_type: "psa" }),
      item({ content_type: "news" }),
      item({ approval_status: "draft" }),
      item({ content_type: "legal_id" }),
    ];
    const result = filterEligibleContent(items, SLOT, "2026-08-07");
    expect(result).toEqual([items[0], items[3]]);
  });
});
