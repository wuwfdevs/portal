import { describe, expect, it } from "vitest";
import {
  agreementActionItems,
  agreementColumns,
  agreementConsumption,
  agreementReserveCovers,
  blockReservesWindow,
  bookingDeadline,
  pastBookingDeadline,
  proposalDraw,
  releaseDeadline,
  reservedBlockState,
  validateAgreementForm,
  validatePartnerForm,
  type AgreementFormValues,
  type AgreementLike,
  type ReservedBlockLike,
} from "./agreements";

// OUR Voices as the fixture (docs/bookings-design.md §2.6): a standing weekly
// studio block, a reserve share, funded student hours, 5 × 60 s a week.
const AGREEMENT: AgreementLike = {
  status: "active",
  starts_on: "2027-01-11",
  ends_on: "2027-05-07",
  booking_deadline_days: 14,
  release_deadline_days: 7,
  reserve_hours_allocated: 120,
  funded_student_hours: 200,
  airtime_minutes_per_week: 5,
};
const LEAD = "lead";
const STUDENT = "student";
const CLASSES = [
  { id: LEAD, charged_in_strategic: false },
  { id: STUDENT, charged_in_strategic: true },
];

function block(overrides: Partial<ReservedBlockLike> & { id: string }): ReservedBlockLike {
  return {
    pool_id: "studio",
    date: "2027-03-01",
    window_start: "08:00",
    window_end: "12:00",
    project_id: null,
    booking_id: null,
    released_at: null,
    kept_by: null,
    ...overrides,
  };
}

describe("deadlines", () => {
  it("count back from the block's date", () => {
    expect(bookingDeadline(block({ id: "b" }), AGREEMENT)).toBe("2027-02-15");
    expect(releaseDeadline(block({ id: "b" }), AGREEMENT)).toBe("2027-02-22");
  });
  it("treat a negative deadline as zero days", () => {
    expect(releaseDeadline(block({ id: "b" }), { release_deadline_days: -3 })).toBe("2027-03-01");
  });
});

describe("reservedBlockState", () => {
  it("is reserved before the release deadline", () => {
    expect(reservedBlockState(block({ id: "b" }), AGREEMENT, "2027-02-22")).toBe("reserved");
  });
  it("reads as released the day after the release deadline with no project and nobody keeping it", () => {
    expect(reservedBlockState(block({ id: "b" }), AGREEMENT, "2027-02-23")).toBe("released");
  });
  it("is kept past the deadline when the director kept it", () => {
    expect(reservedBlockState(block({ id: "b", kept_by: "d" }), AGREEMENT, "2027-02-23")).toBe(
      "kept",
    );
  });
  it("is booked once a project took it, whatever the date", () => {
    expect(reservedBlockState(block({ id: "b", project_id: "p" }), AGREEMENT, "2027-03-05")).toBe(
      "booked",
    );
  });
  it("is released when released by hand, even with a keeper", () => {
    expect(
      reservedBlockState(
        block({ id: "b", kept_by: "d", released_at: "2027-02-01T00:00:00Z" }),
        AGREEMENT,
        "2027-02-01",
      ),
    ).toBe("released");
  });
});

describe("blockReservesWindow", () => {
  it("reserves for an active agreement until the deadline, and when kept or booked", () => {
    expect(blockReservesWindow(block({ id: "b" }), AGREEMENT, "2027-02-22")).toBe(true);
    expect(blockReservesWindow(block({ id: "b" }), AGREEMENT, "2027-02-23")).toBe(false);
    expect(blockReservesWindow(block({ id: "b", kept_by: "d" }), AGREEMENT, "2027-02-23")).toBe(
      true,
    );
    expect(blockReservesWindow(block({ id: "b", project_id: "p" }), AGREEMENT, "2027-02-23")).toBe(
      true,
    );
  });
  it("never reserves for a draft or ended agreement", () => {
    expect(
      blockReservesWindow(block({ id: "b" }), { ...AGREEMENT, status: "draft" }, "2027-02-01"),
    ).toBe(false);
    expect(
      blockReservesWindow(block({ id: "b" }), { ...AGREEMENT, status: "ended" }, "2027-02-01"),
    ).toBe(false);
  });
});

describe("pastBookingDeadline", () => {
  it("flags a reserved block between the booking and release deadlines", () => {
    expect(pastBookingDeadline(block({ id: "b" }), AGREEMENT, "2027-02-15")).toBe(false);
    expect(pastBookingDeadline(block({ id: "b" }), AGREEMENT, "2027-02-16")).toBe(true);
    expect(pastBookingDeadline(block({ id: "b" }), AGREEMENT, "2027-02-23")).toBe(false);
    expect(pastBookingDeadline(block({ id: "b", project_id: "p" }), AGREEMENT, "2027-02-16")).toBe(
      false,
    );
  });
});

describe("agreementConsumption", () => {
  const bookings = [
    { project_id: "p1", treatment: "strategic" as const, hours: { [LEAD]: 6, [STUDENT]: 10 } },
    { project_id: "p2", treatment: "strategic" as const, hours: { [LEAD]: 4.5, [STUDENT]: 8 } },
    // Incremental hours beyond the share draw open capacity, not the agreement's reserve.
    { project_id: "p3", treatment: "incremental" as const, hours: { [LEAD]: 3, [STUDENT]: 2 } },
  ];
  const commitments = [
    {
      airings_per_week: 5,
      seconds: 60,
      treatment: "contributed" as const,
      starts_on: "2027-01-11",
      ends_on: null,
    },
    {
      airings_per_week: 2,
      seconds: 30,
      treatment: "paid" as const,
      starts_on: "2027-01-11",
      ends_on: null,
    },
  ];
  const blocks = [
    block({ id: "b1" }),
    block({ id: "b2", date: "2027-02-01", project_id: "p1" }),
    block({ id: "b3", date: "2027-02-08" }),
    block({ id: "b4", date: "2027-02-08", kept_by: "d" }),
    block({ id: "b5", date: "2027-02-20" }),
  ];
  const consumption = agreementConsumption({
    agreement: AGREEMENT,
    bookings,
    classes: CLASSES,
    commitments,
    blocks,
    todayISO: "2027-02-10",
  });

  it("draws the reserve with strategic professional hours only", () => {
    expect(consumption.reserve).toEqual({
      allowed: 120,
      used: 10.5,
      remaining: 109.5,
      share: 0.0875,
    });
  });
  it("counts student hours under every treatment", () => {
    expect(consumption.students).toEqual({ allowed: 200, used: 20, remaining: 180, share: 0.1 });
  });
  it("counts contributed airtime only", () => {
    expect(consumption.airtime).toEqual({ allowed: 5, used: 5, remaining: 0, share: 1 });
  });
  it("tallies the blocks by state at the given date", () => {
    // b1 reserved (Mar 1, deadline Feb 22); b2 booked; b3 released (deadline Feb 1);
    // b4 kept; b5 reserved (deadline Feb 13) and past its booking deadline (Feb 6).
    expect(consumption.blocks).toEqual({
      reserved: 2,
      kept: 1,
      booked: 1,
      released: 1,
      total: 5,
      pastBookingDeadline: 1,
    });
  });
  it("leaves one project out when asked", () => {
    const without = agreementConsumption({
      agreement: AGREEMENT,
      bookings,
      classes: CLASSES,
      commitments,
      blocks,
      todayISO: "2027-02-10",
      excludeProjectId: "p1",
    });
    expect(without.reserve.used).toBe(4.5);
    expect(without.students.used).toBe(10);
  });
  it("reads a zero allowance as fully used without dividing by zero", () => {
    const zero = agreementConsumption({
      agreement: { ...AGREEMENT, airtime_minutes_per_week: 0 },
      bookings: [],
      classes: CLASSES,
      commitments,
      blocks: [],
      todayISO: "2027-02-10",
    });
    expect(zero.airtime).toEqual({ allowed: 0, used: 5, remaining: -5, share: 0 });
  });
});

describe("agreementReserveCovers", () => {
  const consumption = { reserve: { allowed: 120, used: 110, remaining: 10, share: 110 / 120 } };
  it("is null when the estimate draws no professional hours", () => {
    expect(agreementReserveCovers({ [STUDENT]: 40 }, CLASSES, consumption)).toBeNull();
  });
  it("covers a draw within what is left and not one beyond it", () => {
    expect(agreementReserveCovers({ [LEAD]: 10 }, CLASSES, consumption)).toBe(true);
    expect(agreementReserveCovers({ [LEAD]: 10.5 }, CLASSES, consumption)).toBe(false);
  });
});

describe("proposalDraw", () => {
  const term = {
    starts_on: "2027-01-11",
    ends_on: "2027-05-07",
    reserveTotal: 120,
    reserveRemaining: 100,
    airtimeRemainingMinutesPerWeek: 12,
  };
  it("shows the share, what is left for everyone else, and the blocks inside the term", () => {
    const draw = proposalDraw(
      { reserve_hours_allocated: 60, airtime_minutes_per_week: 5 },
      [
        { pool_id: "studio", date: "2027-02-01" },
        { pool_id: "studio", date: "2027-02-08" },
        { pool_id: "edit", date: "2027-02-08" },
        { pool_id: "studio", date: "2027-06-01" },
      ],
      term,
    );
    expect(draw).toEqual({
      reserveShare: 0.5,
      reserveRemainingAfter: 40,
      reserveOverdrawn: false,
      airtimeRemainingAfter: 7,
      airtimeOverdrawn: false,
      blocksByPool: { studio: 2, edit: 1 },
      blocksInTerm: 3,
    });
  });
  it("flags an allocation the term cannot carry", () => {
    const draw = proposalDraw(
      { reserve_hours_allocated: 130, airtime_minutes_per_week: 20 },
      [],
      term,
    );
    expect(draw.reserveOverdrawn).toBe(true);
    expect(draw.reserveRemainingAfter).toBe(-30);
    expect(draw.airtimeOverdrawn).toBe(true);
  });
  it("has nothing to compare against without a term", () => {
    const draw = proposalDraw(
      { reserve_hours_allocated: 60, airtime_minutes_per_week: 5 },
      [{ pool_id: "studio", date: "2027-02-01" }],
      null,
    );
    expect(draw.reserveShare).toBeNull();
    expect(draw.reserveRemainingAfter).toBeNull();
    expect(draw.blocksInTerm).toBe(1);
  });
});

describe("validatePartnerForm", () => {
  const valid = {
    name: "Office of Undergraduate Research",
    kind: "uwf_unit",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    defaultFundingIndex: "",
    notes: "",
  };
  it("accepts a named partner", () => {
    expect(validatePartnerForm(valid)).toBeNull();
  });
  it("needs a name, a kind and a plausible email", () => {
    expect(validatePartnerForm({ ...valid, name: " " })).toMatch(/name/);
    expect(validatePartnerForm({ ...valid, kind: "club" })).toMatch(/UWF unit/);
    expect(validatePartnerForm({ ...valid, contactEmail: "nope" })).toMatch(/email/);
  });
});

describe("validateAgreementForm and agreementColumns", () => {
  const valid: AgreementFormValues = {
    label: "OUR Voices, spring 2027",
    startsOn: "2027-01-11",
    endsOn: "2027-05-07",
    reserveHoursAllocated: "120",
    fundedStudentHours: "200",
    expectedVolume: "~60 episodes",
    bookingDeadlineDays: "14",
    releaseDeadlineDays: "7",
    blackoutNotes: "",
    directCostTreatment: "At cost",
    capitalNotes: "",
    beyondEnvelopeNote: "",
    airtimeMinutesPerWeek: "5",
    notes: "",
  };
  it("accepts the fixture", () => {
    expect(validateAgreementForm(valid)).toBeNull();
    expect(agreementColumns(valid)).toMatchObject({
      label: "OUR Voices, spring 2027",
      reserve_hours_allocated: 120,
      funded_student_hours: 200,
      booking_deadline_days: 14,
      release_deadline_days: 7,
      airtime_minutes_per_week: 5,
      blackout_notes: null,
      direct_cost_treatment: "At cost",
    });
  });
  it("defaults blank numbers to zero", () => {
    const blank = { ...valid, reserveHoursAllocated: "", airtimeMinutesPerWeek: "" };
    expect(validateAgreementForm(blank)).toBeNull();
    expect(agreementColumns(blank).reserve_hours_allocated).toBe(0);
    expect(agreementColumns(blank).airtime_minutes_per_week).toBe(0);
  });
  it("names the first problem", () => {
    expect(validateAgreementForm({ ...valid, label: "" })).toMatch(/label/);
    expect(validateAgreementForm({ ...valid, endsOn: "2027-01-01" })).toMatch(/end on or after/);
    expect(validateAgreementForm({ ...valid, reserveHoursAllocated: "-1" })).toMatch(/reserve/);
    expect(validateAgreementForm({ ...valid, bookingDeadlineDays: "1.5" })).toMatch(/whole number/);
    expect(validateAgreementForm({ ...valid, airtimeMinutesPerWeek: "x" })).toMatch(/airtime/);
  });
});

describe("agreementActionItems", () => {
  const agreements = [
    {
      ...AGREEMENT,
      id: "a1",
      partner_id: "pa",
      label: "Draft one",
      status: "draft" as const,
      blocks: [],
    },
    {
      ...AGREEMENT,
      id: "a2",
      partner_id: "pb",
      label: "Live one",
      blocks: [block({ id: "b1", date: "2027-02-20" }), block({ id: "b2", date: "2027-03-01" })],
    },
  ];
  it("asks the executive to approve a draft and the director about late blocks", () => {
    const items = agreementActionItems(agreements, [], "2027-02-10");
    expect(items.map((i) => [i.agreementId, i.kind, i.role])).toEqual([
      ["a1", "approval_pending", "executive"],
      ["a2", "blocks_past_booking_deadline", "director"],
    ]);
    expect(items[1]!.text).toMatch(/1 reserved block past/);
  });
  it("filters by role", () => {
    expect(agreementActionItems(agreements, ["executive"], "2027-02-10")).toHaveLength(1);
    expect(agreementActionItems(agreements, ["production"], "2027-02-10")).toHaveLength(0);
  });
});
