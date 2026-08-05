import { describe, expect, it } from "vitest";
import {
  isCourseBasedType,
  isResearchType,
  MIN_SUBMIT_ELAPSED_MS,
  validateInquiryInput,
  type InquiryInput,
} from "./partnership-types";

function baseInput(overrides: Partial<InquiryInput> = {}): InquiryInput {
  return {
    facultyName: "Dr. Rivera",
    email: "rivera@uwf.edu",
    department: "Communication",
    description: "A guest lecture on local news coverage.",
    partnershipType: "classroom_visit",
    researchTopic: "",
    researchSummary: "",
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

  it("requires topic and summary on the research path, but not the teaching path", () => {
    expect(
      validateInquiryInput(baseInput({ partnershipType: "faculty_research" })),
    ).not.toBeNull();
    expect(
      validateInquiryInput(
        baseInput({
          partnershipType: "faculty_research",
          researchTopic: "Coastal erosion",
          researchSummary: "A study of shoreline change over 20 years.",
        }),
      ),
    ).toBeNull();
    expect(
      validateInquiryInput(baseInput({ partnershipType: "classroom_visit" })),
    ).toBeNull();
  });
});
