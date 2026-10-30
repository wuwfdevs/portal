import { describe, expect, it } from "vitest";
import {
  breadthLine,
  synthesisIntro,
  synthesisSummary,
  synthesizeButtonLabel,
} from "./synthesis-view";

describe("breadthLine", () => {
  it("counts findings, sources and speakers", () => {
    expect(breadthLine({ findings: 3, sources: 2, speakers: 2 })).toBe(
      "3 findings · 2 sources · 2 speakers",
    );
  });
  it("says so when one source is the whole account", () => {
    expect(breadthLine({ findings: 2, sources: 1, speakers: 1 })).toBe(
      "2 findings · 1 source · 1 speaker (one source's account)",
    );
  });
  it("leaves the speakers out for documents", () => {
    expect(breadthLine({ findings: 1, sources: 1, speakers: 0 })).toBe(
      "1 finding · 1 source (one source's account)",
    );
  });
  it("says when nothing accepted is left behind a statement", () => {
    expect(breadthLine({ findings: 0, sources: 0, speakers: 0 })).toContain("No accepted finding");
  });
});

describe("synthesisSummary", () => {
  it("lists only what was written and mentions drops", () => {
    expect(
      synthesisSummary({
        version: 2,
        statements: 5,
        tensions: 1,
        gaps: 0,
        narrative: 0,
        dropped: 3,
      }),
    ).toBe(
      "Version 2 written: 5 statements, 1 tension. 3 proposals failed the checks and were left out.",
    );
  });
  it("is quiet when nothing was dropped", () => {
    expect(
      synthesisSummary({
        version: 1,
        statements: 1,
        tensions: 0,
        gaps: 2,
        narrative: 1,
        dropped: 0,
      }),
    ).toBe("Version 1 written: 1 statement, 2 gaps, 1 narrative note.");
  });
});

describe("synthesizeButtonLabel", () => {
  it("follows what exists", () => {
    expect(synthesizeButtonLabel(false, 0)).toBe("Synthesize");
    expect(synthesizeButtonLabel(true, 0)).toBe("Synthesize again");
    expect(synthesizeButtonLabel(true, 3)).toBe("Update synthesis");
  });
});

describe("synthesisIntro", () => {
  it("asks for accepted findings first", () => {
    expect(
      synthesisIntro({ acceptedFindings: 0, questionCount: 2, hasSynthesis: false }),
    ).toContain("accept what is worth keeping");
  });
  it("points at Setup when there is no question", () => {
    expect(
      synthesisIntro({ acceptedFindings: 4, questionCount: 0, hasSynthesis: false }),
    ).toContain("Setup tab");
  });
});
