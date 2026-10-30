import { describe, expect, it } from "vitest";
import { checkCompetitiveAdjacency } from "./adjacency";

describe("checkCompetitiveAdjacency", () => {
  it("warns when a nearby placement shares the candidate's category", () => {
    const result = checkCompetitiveAdjacency(
      { underwriterId: "u1", categoryId: "cat-real-estate" },
      [{ underwriterId: "u2", categoryId: "cat-real-estate" }],
    );
    expect(result.warning).toBe(true);
    expect(result.conflictingUnderwriterIds).toEqual(["u2"]);
  });

  it("does not warn when categories differ", () => {
    const result = checkCompetitiveAdjacency(
      { underwriterId: "u1", categoryId: "cat-real-estate" },
      [{ underwriterId: "u2", categoryId: "cat-health" }],
    );
    expect(result.warning).toBe(false);
  });

  it("does not warn when the candidate has no category at all", () => {
    const result = checkCompetitiveAdjacency({ underwriterId: "u1", categoryId: null }, [
      { underwriterId: "u2", categoryId: "cat-real-estate" },
    ]);
    expect(result.warning).toBe(false);
  });

  it("never flags the same underwriter's own other placements as a conflict", () => {
    const result = checkCompetitiveAdjacency(
      { underwriterId: "u1", categoryId: "cat-real-estate" },
      [{ underwriterId: "u1", categoryId: "cat-real-estate" }],
    );
    expect(result.warning).toBe(false);
  });

  it("deduplicates repeated conflicting underwriters", () => {
    const result = checkCompetitiveAdjacency(
      { underwriterId: "u1", categoryId: "cat-real-estate" },
      [
        { underwriterId: "u2", categoryId: "cat-real-estate" },
        { underwriterId: "u2", categoryId: "cat-real-estate" },
      ],
    );
    expect(result.conflictingUnderwriterIds).toEqual(["u2"]);
  });
});
