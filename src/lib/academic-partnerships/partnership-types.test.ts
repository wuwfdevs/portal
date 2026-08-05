import { describe, expect, it } from "vitest";
import {
  hasCourseBasedTrack,
  hasNonResearchTrack,
  hasResearchTrack,
  isCourseBasedType,
  isResearchType,
  MIN_SUBMIT_ELAPSED_MS,
  PARTNERSHIP_TYPES,
  PARTNERSHIP_TYPE_DESCRIPTION,
  validateInquiryInput,
  type InquiryInput,
} from "./partnership-types";

function baseInput(overrides: Partial<InquiryInput> = {}): InquiryInput {
  return {
    facultyName: "Dr. Rivera",
    email: "rivera@uwf.edu",
    department: "Communication",
    description: "A guest lecture on local news coverage.",
    partnershipTypes: ["classroom_visit"],
    researchTopic: "",
    honeypot: "",
    renderedAtMs: 0,
    nowMs: MIN_SUBMIT_ELAPSED_MS + 1000,
    ...overrides,
  };
}

describe("isResearchType / isCourseBasedType", () => {
  it("only faculty_research is the research path", () => {
    expect(isResearchType("faculty_research")).toBe(true);
    expect(isResearchType("classroom_visit")).toBe(false);
  });

  it("course fields apply to the three teaching-and-student formats", () => {
    expect(isCourseBasedType("classroom_visit")).toBe(true);
    expect(isCourseBasedType("station_immersion")).toBe(true);
    expect(isCourseBasedType("applied_project")).toBe(true);
    expect(isCourseBasedType("internship_practicum")).toBe(false);
    expect(isCourseBasedType("faculty_research")).toBe(false);
    expect(isCourseBasedType("other")).toBe(false);
  });
});

describe("hasResearchTrack / hasCourseBasedTrack / hasNonResearchTrack", () => {
  it("detects research among several chosen tracks", () => {
    expect(hasResearchTrack(["classroom_visit", "faculty_research"])).toBe(true);
    expect(hasResearchTrack(["classroom_visit", "other"])).toBe(false);
    expect(hasResearchTrack([])).toBe(false);
  });

  it("detects a course-based track among several chosen", () => {
    expect(hasCourseBasedTrack(["faculty_research", "applied_project"])).toBe(true);
    expect(hasCourseBasedTrack(["faculty_research", "internship_practicum"])).toBe(false);
  });

  it("is false only when every chosen track is research", () => {
    expect(hasNonResearchTrack(["faculty_research"])).toBe(false);
    expect(hasNonResearchTrack(["faculty_research", "other"])).toBe(true);
    expect(hasNonResearchTrack([])).toBe(false);
  });
});

describe("PARTNERSHIP_TYPE_DESCRIPTION", () => {
  it("has a non-empty description for every track", () => {
    for (const type of PARTNERSHIP_TYPES) {
      expect(PARTNERSHIP_TYPE_DESCRIPTION[type].length).toBeGreaterThan(0);
    }
  });
});

describe("validateInquiryInput", () => {
  it("accepts a complete, well-timed submission", () => {
    expect(validateInquiryInput(baseInput())).toBeNull();
  });

  it("silently accepts a tripped honeypot rather than explaining the check", () => {
    expect(validateInquiryInput(baseInput({ honeypot: "http://spam.example" }))).toBeNull();
  });

  it("rejects a submission faster than a human could plausibly fill the form", () => {
    expect(validateInquiryInput(baseInput({ nowMs: 500 }))).not.toBeNull();
  });

  it("requires the base fields", () => {
    expect(validateInquiryInput(baseInput({ facultyName: "" }))).not.toBeNull();
    expect(validateInquiryInput(baseInput({ email: "not-an-email" }))).not.toBeNull();
    expect(validateInquiryInput(baseInput({ department: "" }))).not.toBeNull();
    expect(validateInquiryInput(baseInput({ description: "" }))).not.toBeNull();
  });

  it("requires at least one track to be chosen", () => {
    expect(validateInquiryInput(baseInput({ partnershipTypes: [] }))).not.toBeNull();
  });

  it("accepts more than one chosen track", () => {
    expect(
      validateInquiryInput(baseInput({ partnershipTypes: ["classroom_visit", "applied_project"] })),
    ).toBeNull();
  });

  it("requires a topic when faculty_research is among the chosen tracks", () => {
    expect(
      validateInquiryInput(baseInput({ partnershipTypes: ["faculty_research"] })),
    ).not.toBeNull();
    expect(
      validateInquiryInput(
        baseInput({
          partnershipTypes: ["classroom_visit", "faculty_research"],
          researchTopic: "Coastal erosion",
        }),
      ),
    ).toBeNull();
    expect(
      validateInquiryInput(baseInput({ partnershipTypes: ["classroom_visit"] })),
    ).toBeNull();
  });
});
