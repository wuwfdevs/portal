import { describe, expect, it } from "vitest";
import {
  buildAgreementOutputSchema,
  formValuesFromModelLine,
  isAgreementModelOutput,
  proposeScheduleFromModelOutput,
  type AgreementModelLine,
  type AgreementModelOutput,
  type ProposalContext,
} from "./agreement-import";

const POOLS = [
  { id: "pool-am", name: "AM Drive" },
  { id: "pool-carpool", name: "Carpool" },
];
const PROGRAMS = [
  { id: "prog-me", name: "Morning Edition" },
  { id: "prog-atc", name: "All Things Considered" },
];

function context(overrides: Partial<ProposalContext> = {}): ProposalContext {
  return {
    pools: POOLS,
    programs: PROGRAMS,
    flights: [],
    contract: {
      effective_from: "2026-08-03",
      effective_to: "2027-01-31",
      stated_total_spots: null,
      sponsorship_total: null,
      affidavit_required: false,
      makegood_requires_agency_approval: false,
      separation_source_text: null,
      preemption_policy: null,
    },
    ...overrides,
  };
}

function modelLine(overrides: Partial<AgreementModelLine> = {}): AgreementModelLine {
  return {
    label: "Monday AM drive",
    source_text: "Monday ~7:49am x 26 weeks",
    entry_kind: "fixed_days",
    count_per_day: 1,
    quantity: null,
    interval_weeks: null,
    explicit_dates: [],
    week_grid: [],
    days_of_week: [1],
    pool: null,
    program: "Morning Edition",
    time_mode: "preferred",
    window_start: null,
    window_end: null,
    preferred_time: "07:49",
    max_per_day: null,
    service_level: "guaranteed",
    duration_seconds: 30,
    start_date: "2026-08-03",
    end_date: "2027-01-31",
    flight: null,
    stated_total: 26,
    notes: null,
    ...overrides,
  };
}

function output(overrides: Partial<AgreementModelOutput> = {}): AgreementModelOutput {
  return {
    order: {
      effective_from: "2026-08-03",
      effective_to: "2027-01-31",
      stated_total_spots: 104,
      sponsorship_total: null,
      affidavit_required: false,
      makegood_requires_agency_approval: null,
      separation_source_text: null,
      preemption_policy: "rescheduled within the program originally sponsored",
    },
    flights: [],
    lines: [modelLine()],
    unresolved: [],
    notes: [],
    ...overrides,
  };
}

describe("buildAgreementOutputSchema", () => {
  it("makes pools and programs closed sets of the names on file", () => {
    const schema = buildAgreementOutputSchema({
      poolNames: ["AM Drive"],
      programNames: ["Morning Edition", "1A"],
    });
    const line = schema.properties.lines.items as { properties: Record<string, unknown> };
    expect(line.properties.pool).toMatchObject({
      anyOf: [{ type: "string", enum: ["AM Drive"] }, { type: "null" }],
    });
    expect(line.properties.program).toMatchObject({
      anyOf: [{ type: "string", enum: ["Morning Edition", "1A"] }, { type: "null" }],
    });
  });

  it("collapses an empty set to null rather than an invalid empty enum", () => {
    const schema = buildAgreementOutputSchema({ poolNames: [], programNames: ["1A"] });
    const line = schema.properties.lines.items as { properties: Record<string, unknown> };
    expect(line.properties.pool).toMatchObject({ type: "null" });
  });

  it("lists every property as required, as strict mode demands", () => {
    const schema = buildAgreementOutputSchema({ poolNames: ["AM Drive"], programNames: [] });
    const line = schema.properties.lines.items as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect([...line.required].sort()).toEqual(Object.keys(line.properties).sort());
    expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
    const order = schema.properties.order as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect([...order.required].sort()).toEqual(Object.keys(order.properties).sort());
  });
});

describe("formValuesFromModelLine", () => {
  it("fills only the fields the entry kind uses, blanking the rest", () => {
    const values = formValuesFromModelLine(
      modelLine({
        quantity: 3,
        interval_weeks: 2,
        week_grid: [{ week_start: "2026-08-03", quantity: 1 }],
      }),
      { poolId: null, programId: "prog-me", flightId: null },
    );
    expect(values.count_per_day).toBe("1");
    expect(values.quantity).toBe("");
    expect(values.interval_weeks).toBe("");
    expect(values.week_grid).toEqual([]);
    expect(values.preferred_time).toBe("07:49");
    expect(values.window_start).toBe("");
    expect(values.program_id).toBe("prog-me");
    expect(values.pool_id).toBe("");
  });

  it("normalises times to HH:MM and dates to blank when malformed", () => {
    const values = formValuesFromModelLine(
      modelLine({ preferred_time: "7:49:00", end_date: "January 31" }),
      { poolId: null, programId: null, flightId: null },
    );
    expect(values.preferred_time).toBe("07:49");
    expect(values.end_date).toBe("");
  });

  it("assumes the default length when the order prints none", () => {
    const values = formValuesFromModelLine(modelLine({ duration_seconds: null }), {
      poolId: null,
      programId: null,
      flightId: null,
    });
    expect(values.duration_seconds).toBe("30");
  });
});

describe("proposeScheduleFromModelOutput", () => {
  it("turns the reference agreement's lines into compiled, described lines", () => {
    const proposal = proposeScheduleFromModelOutput(
      output({
        lines: [
          modelLine(),
          modelLine({
            label: "Tuesday PM drive",
            source_text: "Tuesday ~4:48pm x 26 weeks",
            days_of_week: [2],
            program: "All Things Considered",
            preferred_time: "16:48",
          }),
          modelLine({
            label: "Wed/Thu AM drive",
            source_text: "Wednesday and Thursday ~8:06am x 26 weeks",
            days_of_week: [3, 4],
            preferred_time: "08:06",
            stated_total: 52,
          }),
        ],
      }),
      context(),
    );
    expect(proposal.lines).toHaveLength(3);
    for (const line of proposal.lines) expect(line.compile).toMatchObject({ ok: true });
    expect(proposal.lines.map((line) => (line.compile.ok ? line.compile.expected : -1))).toEqual([
      26, 26, 52,
    ]);
    expect(proposal.lines[0]!.programName).toBe("Morning Edition");
    expect(proposal.lines[0]!.description).toContain("Morning Edition");
    expect(proposal.lines[0]!.description).toContain("7:49 AM");
    expect(proposal.lines[0]!.warnings).toEqual([]);
    expect(proposal.expectedTotal).toBe(104);
    expect(proposal.statedTotalSpots).toBe(104);
  });

  it("resolves pool and program names case-insensitively and flags a name not on file", () => {
    const proposal = proposeScheduleFromModelOutput(
      output({
        lines: [
          modelLine({ pool: "carpool", program: null }),
          modelLine({ pool: "Drive Time", program: null }),
        ],
      }),
      context(),
    );
    expect(proposal.lines[0]!.values.pool_id).toBe("pool-carpool");
    expect(proposal.lines[0]!.poolName).toBe("Carpool");
    expect(proposal.lines[1]!.values.pool_id).toBe("");
    expect(proposal.lines[1]!.warnings[0]).toContain('"Drive Time" isn\'t a pool on file');
    // Without a pool or program the line can't be saved yet — reported, not dropped.
    expect(proposal.lines[1]!.compile).toMatchObject({ ok: false });
    if (!proposal.lines[1]!.compile.ok)
      expect(proposal.lines[1]!.compile.errors.join(" ")).toContain("Choose an inventory pool");
  });

  it("keeps a line whose reading doesn't compile, with the parser's own errors", () => {
    const proposal = proposeScheduleFromModelOutput(
      output({ lines: [modelLine({ days_of_week: [], end_date: null })] }),
      context(),
    );
    const line = proposal.lines[0]!;
    expect(line.compile.ok).toBe(false);
    if (!line.compile.ok) expect(line.compile.errors[0]).toContain("day(s) of the week");
    expect(line.description).toBe("Monday AM drive");
    expect(proposal.expectedTotal).toBe(0);
  });

  it("warns when the order's own count for a line disagrees with what it compiles to", () => {
    const proposal = proposeScheduleFromModelOutput(
      output({ lines: [modelLine({ stated_total: 27 })] }),
      context(),
    );
    expect(proposal.lines[0]!.warnings).toEqual([
      "The order says 27 for this line; as read it compiles to 26.",
    ]);
  });

  it("warns when the length was assumed", () => {
    const proposal = proposeScheduleFromModelOutput(
      output({ lines: [modelLine({ duration_seconds: null })] }),
      context(),
    );
    expect(proposal.lines[0]!.warnings[0]).toContain("30s is assumed");
  });

  it("matches a line to an existing flight, or proposes the flight the order describes", () => {
    const proposal = proposeScheduleFromModelOutput(
      output({
        flights: [{ name: "Spring Gala", start_date: "2027-03-08", end_date: "2027-03-19" }],
        lines: [
          modelLine({ flight: "Holiday Concert" }),
          modelLine({ flight: "spring gala", start_date: "2027-03-08", end_date: "2027-03-19" }),
          modelLine({ flight: "Mystery Show" }),
        ],
      }),
      context({ flights: [{ id: "flight-holiday", name: "Holiday Concert" }] }),
    );
    expect(proposal.lines[0]!.values.flight_id).toBe("flight-holiday");
    expect(proposal.lines[0]!.flightName).toBe("Holiday Concert");
    expect(proposal.lines[0]!.newFlight).toBeNull();
    expect(proposal.lines[1]!.values.flight_id).toBe("");
    expect(proposal.lines[1]!.newFlight).toEqual({
      name: "Spring Gala",
      start_date: "2027-03-08",
      end_date: "2027-03-19",
    });
    expect(proposal.lines[2]!.newFlight).toBeNull();
    expect(proposal.lines[2]!.warnings[0]).toContain('"Mystery Show"');
  });

  it("proposes order facts the contract lacks and lists disagreements without applying them", () => {
    const proposal = proposeScheduleFromModelOutput(
      output({
        order: {
          effective_from: "2026-08-03",
          effective_to: "2027-02-28",
          stated_total_spots: 104,
          sponsorship_total: 5200,
          affidavit_required: true,
          makegood_requires_agency_approval: false,
          separation_source_text: "3",
          preemption_policy: null,
        },
      }),
      context({
        contract: {
          effective_from: "2026-08-03",
          effective_to: "2027-01-31",
          stated_total_spots: 100,
          sponsorship_total: null,
          affidavit_required: false,
          makegood_requires_agency_approval: false,
          separation_source_text: null,
          preemption_policy: null,
        },
      }),
    );
    expect(proposal.orderUpdates.map((update) => update.field)).toEqual([
      "sponsorship_total",
      "affidavit_required",
      "separation_source_text",
    ]);
    expect(proposal.orderUpdates[0]).toMatchObject({ proposedText: "$5,200", value: 5200 });
    expect(proposal.orderUpdates[1]).toMatchObject({ proposedText: "yes", value: true });
    expect(proposal.orderConflicts).toEqual([
      "Run end: the contract says 2027-01-31, the document says 2027-02-28.",
      "Total spots on the order: the contract says 100, the document says 104.",
    ]);
    // The contract's own stated total wins for the reconciliation line.
    expect(proposal.statedTotalSpots).toBe(100);
  });

  it("carries unresolved instructions and notes through, trimmed", () => {
    const proposal = proposeScheduleFromModelOutput(
      output({
        lines: [],
        unresolved: [{ source_text: "  Bonus: as available ", reason: " no quantity " }],
        notes: [" Oct. 3 is a Saturday ", ""],
      }),
      context(),
    );
    expect(proposal.unresolved).toEqual([
      { source_text: "Bonus: as available", reason: "no quantity" },
    ]);
    expect(proposal.notes).toEqual(["Oct. 3 is a Saturday"]);
  });
});

describe("isAgreementModelOutput", () => {
  it("accepts the promised shape and rejects anything else", () => {
    expect(isAgreementModelOutput(output())).toBe(true);
    expect(isAgreementModelOutput({ lines: [] })).toBe(false);
    expect(isAgreementModelOutput(null)).toBe(false);
    expect(isAgreementModelOutput("{}")).toBe(false);
  });
});
