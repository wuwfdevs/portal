import { describe, expect, it } from "vitest";
import { matchesExceptionFilter } from "./exception-filters";

const open = { resolution_status: "open", makegood_approval: "not_required" } as const;
const pending = { resolution_status: "open", makegood_approval: "pending" } as const;
const resolved = { resolution_status: "resolved", makegood_approval: "approved" } as const;

describe("matchesExceptionFilter", () => {
  it("all matches everything", () => {
    for (const e of [open, pending, resolved]) expect(matchesExceptionFilter(e, "all")).toBe(true);
  });
  it("open and resolved follow resolution status", () => {
    expect(matchesExceptionFilter(pending, "open")).toBe(true);
    expect(matchesExceptionFilter(resolved, "open")).toBe(false);
    expect(matchesExceptionFilter(resolved, "resolved")).toBe(true);
  });
  it("agency_pending is only a pending makegood approval", () => {
    expect(matchesExceptionFilter(pending, "agency_pending")).toBe(true);
    expect(matchesExceptionFilter(open, "agency_pending")).toBe(false);
    expect(matchesExceptionFilter(resolved, "agency_pending")).toBe(false);
  });
});
