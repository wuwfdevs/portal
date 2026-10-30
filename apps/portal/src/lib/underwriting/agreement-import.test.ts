import { describe, expect, it } from "vitest";
import {
  buildAgreementOutputSchema,
  formValuesFromModelLine,
  isAgreementModelOutput,
  mergeOrderFacts,
  NEW_UNDERWRITER,
  parseAgreementReading,
  proposeScheduleFromModelOutput,
  type AgreementModelLine,
  type AgreementModelOrder,
  type AgreementModelOutput,
  type ProposalContext,
  type TypedOrderFields,
} from "./agreement-import";
import { RADIO_TRAFFIC_MIGRATION_CORRECTIONS } from "./fixtures/radio-traffic-migration";

const POOLS = [
  { id: "pool-am", name: "AM Drive" },
  { id: "pool-carpool", name: "Carpool" },
];
const PROGRAMS = [
  { id: "prog-me", name: "Morning Edition" },
  { id: "prog-atc", name: "All Things Considered" },
];
const UNDERWRITERS = [
  { id: "uw-abb", name: "Autumn Beck Blackledge" },
  { id: "uw-boyles", name: "Boyles & Boyles" },
];

function context(overrides: Partial<ProposalContext> = {}): ProposalContext {
  return { pools: POOLS, programs: PROGRAMS, flights: [], ...overrides };
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

function order(overrides: Partial<AgreementModelOrder> = {}): AgreementModelOrder {
  return {
    underwriter: "Autumn Beck Blackledge",
    new_underwriter_name: null,
    contract_identifier: "ABB-0826",
    effective_from: "2026-08-03",
    effective_to: "2027-01-31",
    sponsorship_category: "RadioLive",
    stated_total_spots: 104,
    sponsorship_total: 5200,
    affidavit_required: false,
    makegood_requires_agency_approval: null,
    separation_source_text: null,
    preemption_policy: "rescheduled within the program originally sponsored",
    ...overrides,
  };
}

function output(overrides: Partial<AgreementModelOutput> = {}): AgreementModelOutput {
  return {
    order: order(),
    flights: [],
    lines: [modelLine()],
    unresolved: [],
    notes: [],
    ...overrides,
  };
}

function typed(overrides: Partial<TypedOrderFields> = {}): TypedOrderFields {
  return {
    underwriter_id: "",
    contract_identifier: "",
    effective_from: "",
    effective_to: "",
    sponsorship_total: "",
    sponsorship_category: "",
    notes: "",
    ...overrides,
  };
}

describe("buildAgreementOutputSchema", () => {
  it("makes underwriters, pools and programs closed sets of the names on file", () => {
    const schema = buildAgreementOutputSchema({
      underwriterNames: ["Boyles & Boyles"],
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
    expect(schema.properties.order.properties.underwriter).toMatchObject({
      anyOf: [{ type: "string", enum: ["Boyles & Boyles", NEW_UNDERWRITER] }, { type: "null" }],
    });
  });

  it("collapses an empty set to null rather than an invalid empty enum", () => {
    const schema = buildAgreementOutputSchema({
      underwriterNames: [],
      poolNames: [],
      programNames: ["1A"],
    });
    const line = schema.properties.lines.items as { properties: Record<string, unknown> };
    expect(line.properties.pool).toMatchObject({ type: "null" });
    // The underwriter always has NEW to fall back on.
    expect(schema.properties.order.properties.underwriter).toMatchObject({
      anyOf: [{ type: "string", enum: [NEW_UNDERWRITER] }, { type: "null" }],
    });
  });

  it("lists every property as required, as strict mode demands", () => {
    const schema = buildAgreementOutputSchema({
      underwriterNames: [],
      poolNames: ["AM Drive"],
      programNames: [],
    });
    const line = schema.properties.lines.items as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect([...line.required].sort()).toEqual(Object.keys(line.properties).sort());
    expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
    expect([...schema.properties.order.required].sort()).toEqual(
      Object.keys(schema.properties.order.properties).sort(),
    );
  });
});

describe("mergeOrderFacts", () => {
  it("takes the document's facts when nothing was typed", () => {
    const result = mergeOrderFacts(typed(), order(), UNDERWRITERS);
    expect(result).toMatchObject({
      ok: true,
      warnings: [],
      value: {
        underwriter_id: "uw-abb",
        contract_identifier: "ABB-0826",
        effective_from: "2026-08-03",
        effective_to: "2027-01-31",
        sponsorship_total: 5200,
        sponsorship_category: "RadioLive",
        notes: null,
        stated_total_spots: 104,
        affidavit_required: false,
        makegood_requires_agency_approval: false,
        separation_source_text: null,
        preemption_policy: "rescheduled within the program originally sponsored",
      },
    });
  });

  it("lets what the staffer typed win over the document", () => {
    const result = mergeOrderFacts(
      typed({
        underwriter_id: "uw-boyles",
        contract_identifier: "IO-7",
        effective_to: "2027-02-28",
        sponsorship_total: "6000",
        notes: "Renewal",
      }),
      order(),
      UNDERWRITERS,
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        underwriter_id: "uw-boyles",
        contract_identifier: "IO-7",
        effective_from: "2026-08-03",
        effective_to: "2027-02-28",
        sponsorship_total: 6000,
        notes: "Renewal",
      },
    });
  });

  it("matches the document's underwriter to the name on file, case-insensitively", () => {
    const result = mergeOrderFacts(
      typed(),
      order({ underwriter: "boyles & boyles" }),
      UNDERWRITERS,
    );
    expect(result).toMatchObject({ ok: true, value: { underwriter_id: "uw-boyles" } });
  });

  it("refuses a sponsor nobody has added, naming them", () => {
    const result = mergeOrderFacts(
      typed(),
      order({ underwriter: NEW_UNDERWRITER, new_underwriter_name: "Bud & Alley's" }),
      UNDERWRITERS,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('"Bud & Alley\'s"');
  });

  it("asks for the underwriter when the document names none", () => {
    const result = mergeOrderFacts(
      typed(),
      order({ underwriter: null, new_underwriter_name: null }),
      UNDERWRITERS,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("choose the underwriter");
  });

  it("needs a start date from somewhere", () => {
    const result = mergeOrderFacts(typed(), order({ effective_from: null }), UNDERWRITERS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("start date");
  });

  it("leaves a missing order number blank — never makes one up", () => {
    const result = mergeOrderFacts(typed(), order({ contract_identifier: null }), UNDERWRITERS);
    expect(result).toMatchObject({ ok: true, value: { contract_identifier: null } });
    if (result.ok) expect(result.warnings.join(" ")).not.toContain("order number");
  });

  it("only ever sets a policy flag to true from the document", () => {
    const result = mergeOrderFacts(
      typed(),
      order({ affidavit_required: true, makegood_requires_agency_approval: null }),
      UNDERWRITERS,
    );
    expect(result).toMatchObject({
      ok: true,
      value: { affidavit_required: true, makegood_requires_agency_approval: false },
    });
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
    // Without a pool or program the line can't be saved — reported, not dropped.
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

describe("parseAgreementReading", () => {
  const reading = {
    version: 1,
    read_at: "2026-09-27T12:00:00.000Z",
    document_path: "abc/agreement.pdf",
    output: output({ lines: [modelLine(), modelLine()] }),
    lines: [
      { saved: true, error: null },
      { saved: false, error: "Choose the day(s) of the week the credit airs." },
    ],
    warnings: ["placeholder identifier"],
  };

  it("round-trips a stored reading", () => {
    expect(parseAgreementReading(JSON.parse(JSON.stringify(reading)))).toEqual(reading);
  });

  it("rejects a reading whose outcomes don't line up with its lines, or of another version", () => {
    expect(parseAgreementReading({ ...reading, lines: [{ saved: true, error: null }] })).toBeNull();
    expect(parseAgreementReading({ ...reading, version: 2 })).toBeNull();
    expect(parseAgreementReading(null)).toBeNull();
    expect(parseAgreementReading([])).toBeNull();
  });
});

describe("the first real migration's unsaved instructions, read under the pool rules", () => {
  const pools = [
    "Drive Time",
    "Weekend Edition",
    "Weekday AM Drive",
    "Weekday PM Drive",
    "Total Program Rotation",
  ].map((name) => ({ id: `pool-${name}`, name }));

  for (const correction of RADIO_TRAFFIC_MIGRATION_CORRECTIONS) {
    it(`${correction.sponsor}: every line saves and they total ${correction.expectedTotal}`, () => {
      const proposal = proposeScheduleFromModelOutput(
        output({ lines: correction.lines }),
        context({ pools, programs: [] }),
      );
      for (const line of proposal.lines) expect(line.compile).toMatchObject({ ok: true });
      const total = proposal.lines.reduce(
        (sum, line) => sum + (line.compile.ok ? line.compile.expected : 0),
        0,
      );
      expect(total).toBe(correction.expectedTotal);
    });
  }

  it("rotates an every-other-week pair onto alternate weeks", () => {
    const rotating = RADIO_TRAFFIC_MIGRATION_CORRECTIONS.find(
      (correction) => correction.sponsor === "International Paper",
    )!;
    const proposal = proposeScheduleFromModelOutput(
      output({ lines: rotating.lines }),
      context({ pools, programs: [] }),
    );
    expect(proposal.lines.map((line) => (line.compile.ok ? line.compile.expected : -1))).toEqual([
      26, 26,
    ]);
  });

  it("saves an agency grid line that runs until midnight (5:00a–12:00a)", () => {
    const proposal = proposeScheduleFromModelOutput(
      output({
        lines: [
          modelLine({
            label: "Line 42 BN",
            source_text: "MTuWThFSaSu 5:00a-12:00a",
            entry_kind: "week_grid",
            count_per_day: null,
            week_grid: [
              { week_start: "2026-01-26", quantity: 6 },
              { week_start: "2026-02-02", quantity: 12 },
            ],
            days_of_week: [0, 1, 2, 3, 4, 5, 6],
            pool: "Total Program Rotation",
            program: null,
            time_mode: "window",
            window_start: "05:00",
            window_end: "00:00",
            preferred_time: null,
            start_date: "2026-01-26",
            end_date: "2026-02-08",
            stated_total: 18,
          }),
        ],
      }),
      context({ pools, programs: [] }),
    );
    expect(proposal.lines[0]!.compile).toMatchObject({ ok: true, expected: 18 });
  });
});
