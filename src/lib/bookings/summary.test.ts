import { describe, expect, it } from "vitest";
import {
  buildSummary,
  capacityStatusFor,
  capacityPhrase,
  contributionPhrase,
  hourBuckets,
  hoursPhrase,
  serviceName,
  type SummaryInput,
} from "./summary";

const classes = [
  { id: "lead", charged_in_strategic: false },
  { id: "student", charged_in_strategic: true },
];

describe("hourBuckets", () => {
  it("puts classes not charged in a strategic price under staff and the rest under students", () => {
    expect(
      hourBuckets(
        [
          { quantity: 1, labor_hours: { lead: 5, student: 10 } },
          { quantity: 2, labor_hours: { lead: 1 } },
        ],
        classes,
      ),
    ).toEqual({ staff: 7, student: 10 });
  });
});

describe("hoursPhrase", () => {
  it("reads like the brief's example", () => {
    expect(hoursPhrase({ staff: 5, student: 10 })).toBe("5 staff hours, 10 student hours");
    expect(hoursPhrase({ staff: 1, student: 0 })).toBe("1 staff hour");
    expect(hoursPhrase({ staff: 0, student: 0 })).toBeNull();
  });
});

describe("contributionPhrase", () => {
  it("names staff hours before the figure exists, dollars after", () => {
    expect(
      contributionPhrase({ treatment: "strategic", staffHours: 5, contribution: null }),
    ).toBe("WUWF contributes 5 staff hours");
    expect(
      contributionPhrase({ treatment: "strategic", staffHours: 5, contribution: 202.6375 }),
    ).toBe("WUWF contributes $202.64 (5 staff hours)");
  });

  it("says plainly when there is none", () => {
    expect(
      contributionPhrase({ treatment: "incremental", staffHours: 5, contribution: 0 }),
    ).toBe("No WUWF contribution — the partner covers the full cost");
    expect(contributionPhrase({ treatment: "external", staffHours: 5, contribution: 0 })).toBe(
      "No WUWF contribution",
    );
  });
});

describe("capacityPhrase", () => {
  it("covers every state", () => {
    expect(capacityPhrase({ kind: "none_needed" })).toBeNull();
    expect(capacityPhrase({ kind: "available", warnings: 0 })).toBe("Capacity available");
    expect(capacityPhrase({ kind: "attention" })).toBe("Date needs attention");
    expect(capacityPhrase({ kind: "held", until: "Oct 20" })).toBe("Dates held until Oct 20");
  });
});

describe("buildSummary", () => {
  const base: SummaryInput = {
    services: ["Basic event webcast (event)"],
    hours: { staff: 5, student: 10 },
    priced: true,
    total: 575,
    treatment: "strategic",
    capacity: { kind: "available", warnings: 0 },
    contribution: null,
    estimate: { kind: "none" },
    readyToSend: true,
  };

  it("is one sentence, answer first, with no model vocabulary", () => {
    const { text } = buildSummary(base);
    expect(text).toBe(
      "Basic event webcast (event) · 5 staff hours, 10 student hours · $575 · University rate (WUWF contributing) · Capacity available · WUWF contributes 5 staff hours · Ready to send",
    );
    expect(text).not.toMatch(/pool|labor class|treatment|draw|reserve|rate model version/i);
  });

  it("says where a sent estimate stands", () => {
    const { text } = buildSummary({
      ...base,
      estimate: { kind: "sent", expiresAt: "2027-02-01T00:00:00Z", daysLeft: 14 },
    });
    expect(text.endsWith("Estimate expires in 14 days")).toBe(true);
  });

  it("is honest before a price exists", () => {
    const { parts } = buildSummary({ ...base, priced: false, treatment: null });
    expect(parts.find((p) => p.key === "price")?.text).toBe("Not priced yet");
    expect(parts.some((p) => p.key === "contribution")).toBe(false);
  });
});

describe("serviceName", () => {
  it("prefixes a quantity other than one", () => {
    expect(serviceName({ label: "Studio access (half-day)", quantity: 1 })).toBe(
      "Studio access (half-day)",
    );
    expect(serviceName({ label: "Studio access (half-day)", quantity: 2 })).toBe(
      "2 × Studio access (half-day)",
    );
  });
});

describe("capacityStatusFor", () => {
  const base = {
    needsDates: true,
    hasTerm: true,
    eventDate: "2027-02-01",
    openBookings: 2,
    planFailed: false,
    failingDates: 0,
    warnings: 0,
    estimate: { kind: "none" } as const,
    heldUntil: null,
  };
  it("is available when the dates are planned and pass", () => {
    expect(capacityStatusFor(base)).toEqual({ kind: "available", warnings: 0 });
  });
  it("needs attention when the plan failed or a hand-planned date would be refused", () => {
    expect(capacityStatusFor({ ...base, openBookings: 0, planFailed: true })).toEqual({
      kind: "attention",
    });
    expect(capacityStatusFor({ ...base, failingDates: 1 })).toEqual({ kind: "attention" });
  });
  it("reads held and confirmed from where the estimate stands", () => {
    expect(
      capacityStatusFor({
        ...base,
        estimate: { kind: "sent", expiresAt: "x", daysLeft: 3 },
        heldUntil: "Feb 14",
      }),
    ).toEqual({ kind: "held", until: "Feb 14" });
    expect(
      capacityStatusFor({ ...base, estimate: { kind: "approved", approvedAt: "x" } }),
    ).toEqual({ kind: "confirmed" });
  });
  it("is quiet when nothing needs dates, and honest when there is no term or no date", () => {
    expect(capacityStatusFor({ ...base, needsDates: false })).toEqual({ kind: "none_needed" });
    expect(capacityStatusFor({ ...base, hasTerm: false })).toEqual({ kind: "no_term" });
    expect(capacityStatusFor({ ...base, openBookings: 0, eventDate: null })).toEqual({
      kind: "no_date",
    });
    expect(capacityStatusFor({ ...base, openBookings: 0 })).toEqual({ kind: "unplanned" });
  });
});
