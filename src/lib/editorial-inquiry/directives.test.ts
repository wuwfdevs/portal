import { describe, expect, it } from "vitest";
import {
  BRANCH_DIRECTIVE,
  DIRECTIVE_LABELS,
  DRILLDOWN_DIRECTIVE,
  EVALUATE_DIRECTIVE,
  directiveForBody,
} from "./directives";

describe("directiveForBody", () => {
  it("recognizes each canned directive by exact body", () => {
    expect(directiveForBody(BRANCH_DIRECTIVE)).toBe("branch");
    expect(directiveForBody(DRILLDOWN_DIRECTIVE)).toBe("drilldown");
    expect(directiveForBody(EVALUATE_DIRECTIVE)).toBe("evaluate");
  });

  it("returns null for a reporter's own words, even directive-like ones", () => {
    expect(directiveForBody("Drill down into this for me")).toBeNull();
    expect(directiveForBody("")).toBeNull();
  });

  it("has a short label for every mode", () => {
    for (const label of Object.values(DIRECTIVE_LABELS)) {
      expect(label.length).toBeGreaterThan(0);
      expect(label.length).toBeLessThan(60);
    }
  });
});
