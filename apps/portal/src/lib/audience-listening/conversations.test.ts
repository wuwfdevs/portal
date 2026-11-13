import { describe, expect, it } from "vitest";
import { canSendToSourcework, cardNeedsContactWarning, describeGap, findGaps, formatMs } from "./conversations";

describe("formatMs", () => {
  it("reads a position in a recording", () => {
    expect(formatMs(0)).toBe("0:00");
    expect(formatMs(65_000)).toBe("1:05");
    expect(formatMs(3_909_000)).toBe("1:05:09");
    expect(formatMs(-5)).toBe("0:00");
  });
});

describe("cardNeedsContactWarning", () => {
  it("warns only when contact is allowed and there is no way to reach the person", () => {
    expect(cardNeedsContactWarning({ may_contact: true, contact: null })).toBe(true);
    expect(cardNeedsContactWarning({ may_contact: true, contact: "  " })).toBe(true);
    expect(cardNeedsContactWarning({ may_contact: true, contact: "a@x.org" })).toBe(false);
    expect(cardNeedsContactWarning({ may_contact: false, contact: null })).toBe(false);
  });
});

describe("canSendToSourcework", () => {
  it("allows a whole recording, including one the facilitator already sent", () => {
    expect(canSendToSourcework({ status: "complete", sourcework_source_id: null })).toBe(true);
    expect(canSendToSourcework({ status: "sent", sourcework_source_id: null })).toBe(true);
  });
  it("refuses a recording still coming in, or one already in Sourcework", () => {
    expect(canSendToSourcework({ status: "recording", sourcework_source_id: null })).toBe(false);
    expect(canSendToSourcework({ status: "uploading", sourcework_source_id: null })).toBe(false);
    expect(canSendToSourcework({ status: "complete", sourcework_source_id: "x" })).toBe(false);
  });
});

describe("findGaps", () => {
  const seg = (seq: number, at: string, duration_ms: number) => ({ seq, started_at: at, duration_ms });
  it("reports only silences long enough to matter, in order", () => {
    const gaps = findGaps([
      seg(0, "2026-11-15T19:00:00Z", 290_000),
      seg(1, "2026-11-15T19:04:51Z", 290_000), // starts one second after segment 0 ended: the join
      seg(2, "2026-11-15T19:12:00Z", 60_000), // 2 minutes 19 seconds after segment 1 ended
    ]);
    expect(gaps).toEqual([{ beforeSeq: 2, seconds: 139 }]);
  });
  it("skips segments with no start time and handles one segment", () => {
    expect(findGaps([seg(0, "2026-11-15T19:00:00Z", 1000), { seq: 1, started_at: null, duration_ms: 1000 }])).toEqual([]);
    expect(findGaps([])).toEqual([]);
  });
  it("describes a gap in words", () => {
    expect(describeGap(45)).toBe("45 seconds");
    expect(describeGap(120)).toBe("2 minutes");
    expect(describeGap(139)).toBe("2 minutes 19 seconds");
  });
});
