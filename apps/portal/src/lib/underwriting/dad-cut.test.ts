import { describe, expect, it } from "vitest";
import {
  DAD_CUT_PATTERN,
  isRecordedInDad,
  needsRecording,
  isPortalAssignedCut,
  normalizeDadCut,
  spotNumberFromScript,
} from "./dad-cut";

describe("normalizeDadCut", () => {
  it("pads a bare number to five digits", () => {
    expect(normalizeDadCut("65")).toBe("00065");
    expect(normalizeDadCut(" 00065 ")).toBe("00065");
  });

  it("keeps and upper-cases the Portal suffix", () => {
    expect(normalizeDadCut("13a")).toBe("00013A");
    expect(normalizeDadCut("00244A")).toBe("00244A");
  });

  it("refuses anything else", () => {
    expect(normalizeDadCut("")).toBeNull();
    expect(normalizeDadCut(null)).toBeNull();
    expect(normalizeDadCut("123456")).toBeNull();
    expect(normalizeDadCut("12B")).toBeNull();
    expect(normalizeDadCut("UW-1142")).toBeNull();
  });

  it("always produces the stored shape", () => {
    for (const input of ["1", "13a", "00065", "99999A"]) {
      expect(normalizeDadCut(input)).toMatch(DAD_CUT_PATTERN);
    }
  });
});

describe("isPortalAssignedCut", () => {
  it("tells a Portal cut from an existing DAD spot", () => {
    expect(isPortalAssignedCut("00013A")).toBe(true);
    expect(isPortalAssignedCut("00065")).toBe(false);
  });
});

describe("spotNumberFromScript", () => {
  it("reads the spot a play instruction names", () => {
    expect(spotNumberFromScript("Please play the # 2 spot for Dauphin Island Sea Lab")).toBe(2);
    expect(
      spotNumberFromScript(
        'TLC Learning Minute Please the play "TLC spot 34" located in the PPA group',
      ),
    ).toBe(34);
  });

  it("returns null when no spot is named", () => {
    expect(spotNumberFromScript("Support for WUWF comes from Loyalty Credit Union")).toBeNull();
    expect(spotNumberFromScript(null)).toBeNull();
  });
});

describe("isRecordedInDad", () => {
  it("counts an existing DAD spot as recorded", () => {
    expect(isRecordedInDad({ dad_cut: "00065", dad_recorded_at: null })).toBe(true);
  });

  it("needs production's mark for a Portal cut", () => {
    expect(isRecordedInDad({ dad_cut: "00013A", dad_recorded_at: null })).toBe(false);
    expect(isRecordedInDad({ dad_cut: "00013A", dad_recorded_at: "2026-10-02T15:00:00Z" })).toBe(
      true,
    );
  });

  it("is false with no cut", () => {
    expect(isRecordedInDad({ dad_cut: null, dad_recorded_at: null })).toBe(false);
  });
});

describe("needsRecording", () => {
  const base = {
    dad_cut: "00013A",
    dad_recorded_at: null,
    approval_status: "approved",
    effective_to: null,
  };

  it("lists an unrecorded Portal cut on copy that can still air", () => {
    expect(needsRecording(base, "2026-10-02")).toBe(true);
    expect(needsRecording({ ...base, approval_status: "draft" }, "2026-10-02")).toBe(true);
    expect(needsRecording({ ...base, effective_to: "2026-10-02" }, "2026-10-02")).toBe(true);
  });

  it("leaves out recorded, existing-spot, ended, and retired copy", () => {
    expect(needsRecording({ ...base, dad_recorded_at: "2026-10-01T00:00:00Z" }, "2026-10-02")).toBe(
      false,
    );
    expect(needsRecording({ ...base, dad_cut: "00065" }, "2026-10-02")).toBe(false);
    expect(needsRecording({ ...base, effective_to: "2026-10-01" }, "2026-10-02")).toBe(false);
    expect(needsRecording({ ...base, approval_status: "retired" }, "2026-10-02")).toBe(false);
  });
});
