import { describe, expect, it } from "vitest";
import { canRewriteScheduleLine } from "./line-mutability";

describe("canRewriteScheduleLine", () => {
  it("admits a line on a draft contract, whatever its revision's status", () => {
    // The wizard creates the first revision as `current`; the contract is
    // what is still a draft.
    expect(canRewriteScheduleLine({ contractStatus: "draft", revisionStatus: "current" })).toBe(
      true,
    );
  });

  it("admits a line under a draft revision of an active contract", () => {
    expect(canRewriteScheduleLine({ contractStatus: "active", revisionStatus: "draft" })).toBe(
      true,
    );
  });

  it("refuses a line under the current revision of an active contract", () => {
    expect(canRewriteScheduleLine({ contractStatus: "active", revisionStatus: "current" })).toBe(
      false,
    );
    expect(canRewriteScheduleLine({ contractStatus: "expired", revisionStatus: "current" })).toBe(
      false,
    );
  });

  it("refuses any line a placement already references", () => {
    expect(
      canRewriteScheduleLine({
        contractStatus: "draft",
        revisionStatus: "draft",
        placementCount: 1,
      }),
    ).toBe(false);
  });
});
