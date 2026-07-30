import { describe, expect, it } from "vitest";
import {
  fieldKeyFromLabel,
  pillarContributionRequired,
  validatePitchValues,
  type FormFieldDef,
} from "./form";

const field = (overrides: Partial<FormFieldDef>): FormFieldDef => ({
  id: "f1",
  key: "summary",
  label: "Summary",
  field_type: "long_text",
  options: null,
  required: false,
  ...overrides,
});

describe("validatePitchValues", () => {
  it("collects trimmed values and omits empty optional fields", () => {
    const fields = [
      field({ id: "f1", key: "summary", required: true }),
      field({ id: "f2", key: "sources", label: "Sources" }),
    ];
    const result = validatePitchValues(fields, { summary: "  A story.  ", sources: "" });
    expect(result.errors).toEqual({});
    expect(result.values).toEqual([{ fieldId: "f1", value: "A story." }]);
  });

  it("flags missing required fields by key", () => {
    const result = validatePitchValues([field({ required: true })], {});
    expect(result.errors.summary).toContain("required");
    expect(result.values).toEqual([]);
  });

  it("rejects select values outside the configured options", () => {
    const select = field({
      key: "format",
      label: "Format",
      field_type: "select",
      options: ["Feature"],
    });
    expect(validatePitchValues([select], { format: "Feature" }).errors).toEqual({});
    expect(validatePitchValues([select], { format: "Opera" }).errors.format).toBeTruthy();
  });

  it("validates multi_select as a subset of options", () => {
    const multi = field({
      key: "beats",
      label: "Beats",
      field_type: "multi_select",
      options: ["News", "Environment"],
      required: true,
    });
    const ok = validatePitchValues([multi], { beats: ["News", "Environment"] });
    expect(ok.errors).toEqual({});
    expect(ok.values[0]?.value).toEqual(["News", "Environment"]);
    expect(validatePitchValues([multi], { beats: ["News", "Sports"] }).errors.beats).toBeTruthy();
    expect(validatePitchValues([multi], {}).errors.beats).toContain("required");
  });

  it("validates url and date formats", () => {
    const url = field({ key: "link", label: "Link", field_type: "url" });
    const date = field({ key: "peg", label: "Peg", field_type: "date" });
    expect(validatePitchValues([url], { link: "https://wuwf.org" }).errors).toEqual({});
    expect(validatePitchValues([url], { link: "wuwf.org" }).errors.link).toBeTruthy();
    expect(validatePitchValues([date], { peg: "2026-08-01" }).errors).toEqual({});
    expect(validatePitchValues([date], { peg: "next week" }).errors.peg).toBeTruthy();
  });

  describe("pillar_contribution conditional requirement", () => {
    const pillarField = field({
      id: "pillar",
      key: "primary_pillar",
      label: "Primary coverage pillar",
      field_type: "select",
      options: ["Health & public services", "Outside current pillars", "Immediate public need"],
      required: true,
    });
    const contributionField = field({
      id: "contrib",
      key: "pillar_contribution",
      label: "Contribution to sustained coverage",
      required: false,
    });

    it("requires contribution when a defined pillar is selected", () => {
      expect(pillarContributionRequired({ primary_pillar: "Health & public services" })).toBe(true);
      const result = validatePitchValues([pillarField, contributionField], {
        primary_pillar: "Health & public services",
        pillar_contribution: "",
      });
      expect(result.errors.pillar_contribution).toBeTruthy();
    });

    it("does not require contribution for a status option", () => {
      expect(pillarContributionRequired({ primary_pillar: "Outside current pillars" })).toBe(false);
      const result = validatePitchValues([pillarField, contributionField], {
        primary_pillar: "Immediate public need",
        pillar_contribution: "",
      });
      expect(result.errors.pillar_contribution).toBeUndefined();
    });

    it("does not require contribution when no pillar is chosen yet", () => {
      expect(pillarContributionRequired({})).toBe(false);
    });

    it("accepts a filled-in contribution regardless of pillar choice", () => {
      const result = validatePitchValues([pillarField, contributionField], {
        primary_pillar: "Health & public services",
        pillar_contribution: "Advances the health pillar's access throughline.",
      });
      expect(result.errors.pillar_contribution).toBeUndefined();
      expect(result.values.find((v) => v.fieldId === "contrib")?.value).toBe(
        "Advances the health pillar's access throughline.",
      );
    });
  });
});

describe("fieldKeyFromLabel", () => {
  it("slugifies labels", () => {
    expect(fieldKeyFromLabel("Why now?", [])).toBe("why_now");
    expect(fieldKeyFromLabel("  Possible sources ", [])).toBe("possible_sources");
  });

  it("deduplicates against existing keys", () => {
    expect(fieldKeyFromLabel("Summary", ["summary"])).toBe("summary_2");
    expect(fieldKeyFromLabel("Summary", ["summary", "summary_2"])).toBe("summary_3");
  });

  it("never returns an empty key", () => {
    expect(fieldKeyFromLabel("???", [])).toBe("field");
  });
});
