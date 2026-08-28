import { describe, expect, it } from "vitest";
import {
  buildProgramLogPlan,
  clockTimeToSeconds,
  findExistingCopy,
  importedBreakPermittedTypes,
  matchContentItem,
  matchProgram,
  secondsToClockTime,
  type ProgramLogPlanInputs,
} from "./program-log-plan";
import type { ParsedLogEvent, ParsedProgramLog } from "./program-log-verification";

// Since program-log-ai-parse.ts's own network call isn't something a unit
// test can exercise (see program-log-verification.test.ts for its pure,
// tested half), the plan builder's own tests construct a ParsedProgramLog
// by hand — the same shape credit-script verification produces — rather
// than parsing a real export. The events below are drawn from the same real
// 2026-08-21 DAD export this repo's earlier fixtures used, condensed to
// just what each test needs.

const PROGRAMS = [
  { id: "prog-bbc", name: "BBC World Service" },
  { id: "prog-me", name: "Morning Edition" },
  { id: "prog-mm", name: "Marketplace Morning Report" },
];

// 2026-08-21 is a Friday (UTC day 5).
const SCHEDULE = [
  {
    id: "sched-bbc",
    program_id: "prog-bbc",
    clock_template_id: "clock-bbc",
    air_time: "00:00:00",
    duration_minutes: 300,
    entry_type: "recurring" as const,
    days_of_week: [1, 2, 3, 4, 5],
    start_date: "2026-01-01",
    end_date: null,
  },
  {
    id: "sched-me",
    program_id: "prog-me",
    clock_template_id: "clock-me",
    air_time: "05:00:00",
    duration_minutes: 240,
    entry_type: "recurring" as const,
    days_of_week: [1, 2, 3, 4, 5],
    start_date: "2026-01-01",
    end_date: null,
  },
];

function event(
  partial: Partial<ParsedLogEvent> & Pick<ParsedLogEvent, "time" | "kind" | "description">,
): ParsedLogEvent {
  return {
    timeSeconds: clockTimeToSeconds(partial.time),
    lengthSeconds: null,
    availDurationSeconds: null,
    credits: [],
    ...partial,
  };
}

const FIXTURE_EVENTS: ParsedLogEvent[] = [
  event({ time: "00:00:00", kind: "program_start", description: "BBC World Service", lengthSeconds: 0 }),
  event({ time: "00:06:00", kind: "avail", description: "UW Credit (00:30)", availDurationSeconds: 30 }),
  event({ time: "05:00:00", kind: "program_start", description: "Morning Edition", lengthSeconds: 0 }),
  // A covering avail with no script of its own, and two separate cart-bearing
  // credit rows landing inside its window — the grouping-by-open-window
  // logic has to work the same whether a credit comes from the avail's own
  // resolved list or from a standalone "credit" row.
  event({ time: "06:06:00", kind: "avail", description: "UW Credit (01:30)", availDurationSeconds: 90 }),
  event({
    time: "06:06:00",
    kind: "credit",
    description: "Baptist Healthcare / Copy 1",
    lengthSeconds: 30,
    credits: [
      {
        cart: "1",
        label: "Copy 1",
        underwriterName: "Baptist Healthcare",
        script: "Local support for WUWF is provided by Baptist Health Care.",
        durationSeconds: 30,
      },
    ],
  }),
  event({
    time: "06:06:30",
    kind: "credit",
    description: "Clark,Partington,Hart,Larry,Bond & Stackhouse / CPH Law",
    lengthSeconds: 30,
    credits: [
      {
        cart: "15",
        label: "CPH Law",
        underwriterName: "Clark,Partington,Hart,Larry,Bond & Stackhouse",
        script: "Support for WUWF comes from Clark Partington... Attorneys at Law.",
        durationSeconds: 30,
      },
    ],
  }),
  // The real case this whole redesign exists for: two cart-less credits
  // bundled under one avail with no separating marker, both resolved
  // (one matched to a known underwriter, one newly identified).
  event({
    time: "06:49:35",
    kind: "avail",
    description: "UW Credit (01:55)",
    availDurationSeconds: 115,
    credits: [
      {
        cart: null,
        label: "Live read",
        underwriterName: "Juan's Flying Burrito",
        script: "Support for WUWF comes from Juan's Flying Burrito on Alcaniz Street.",
        durationSeconds: null,
      },
      {
        cart: null,
        label: "Live read",
        underwriterName: "Autumn Beck Blackledge",
        script: "Support for WUWF comes from Autumn Beck Blackledge, Attorneys of Divorce and Family Law.",
        durationSeconds: null,
      },
    ],
  }),
  event({
    time: "07:06:30",
    kind: "credit",
    description: "FPM - FL Power & Light / copy 1",
    lengthSeconds: 30,
    credits: [
      {
        cart: "47",
        label: "copy 1",
        underwriterName: "FPM - FL Power & Light",
        script: "Support for WUWF comes from F P L … Whatever the day, whatever the hour.",
        durationSeconds: 30,
      },
    ],
  }),
  event({ time: "07:33:00", kind: "content", description: "Unearthing Florida", lengthSeconds: 90 }),
  event({ time: "07:43:00", kind: "content", description: "Birdnote Daily -Located in the Eco group DAD", lengthSeconds: 105 }),
  event({ time: "07:47:00", kind: "note", description: "Take Meter Readings" }),
  event({ time: "08:51:30", kind: "program_start", description: "Marketplace Morning", lengthSeconds: 0 }),
];

const PARSED_FIXTURE: ParsedProgramLog = {
  airDate: "2026-08-21",
  weekday: "Friday",
  warnings: [],
  events: FIXTURE_EVENTS,
};

function baseInputs(): ProgramLogPlanInputs {
  return {
    parsed: PARSED_FIXTURE,
    programs: PROGRAMS,
    scheduleEntries: SCHEDULE,
    existingRundowns: [],
    underwriters: [],
    copy: [],
    contentItems: [],
  };
}

describe("matchProgram", () => {
  it("matches exactly and by containment, longest name winning", () => {
    expect(matchProgram("Morning Edition", PROGRAMS)?.id).toBe("prog-me");
    expect(
      matchProgram("Marketplace PM - Play through ENCO Programs Fader", [{ id: "prog-mpm", name: "Marketplace PM" }])
        ?.id,
    ).toBe("prog-mpm");
    expect(matchProgram("1A", [{ id: "prog-1a", name: "1A" }])?.id).toBe("prog-1a");
    expect(matchProgram("UW Credit (01:00)", PROGRAMS)).toBeNull();
  });

  it("never containment-matches a too-short name", () => {
    expect(matchProgram("Marketplace Morning", [{ id: "x", name: "1A" }])).toBeNull();
  });
});

describe("findExistingCopy", () => {
  const underwriters = new Map([["uw-1", { id: "uw-1", name: "Baptist Healthcare" }]]);
  const existing = {
    id: "copy-1",
    underwriter_id: "uw-1",
    label: "Copy 1",
    cart_identifier: "1",
    script: "Local support for WUWF is provided by Baptist Health Care.",
    duration_seconds: 30,
  };

  it("matches on cart + label + underwriter name", () => {
    const { match, scriptChanged } = findExistingCopy(
      {
        cart: "1",
        label: "Copy 1",
        underwriterName: "Baptist Healthcare",
        script: "Local  support for WUWF is provided by Baptist Health Care.",
        durationSeconds: 30,
      },
      [existing],
      underwriters,
    );
    expect(match?.id).toBe("copy-1");
    expect(scriptChanged).toBe(false);
  });

  it("flags a matched copy whose script text changed", () => {
    const { match, scriptChanged } = findExistingCopy(
      { cart: "1", label: "Copy 1", underwriterName: "Baptist Healthcare", script: "Entirely new message.", durationSeconds: 30 },
      [existing],
      underwriters,
    );
    expect(match?.id).toBe("copy-1");
    expect(scriptChanged).toBe(true);
  });

  it("rejects a cart collision under a different underwriter", () => {
    const { match } = findExistingCopy(
      { cart: "1", label: "Copy 1", underwriterName: "Someone Else", script: "x", durationSeconds: 30 },
      [existing],
      underwriters,
    );
    expect(match).toBeNull();
  });

  it("matches an unattributed copy row (contract-era, no underwriter_id) on cart + label", () => {
    const { match } = findExistingCopy(
      { cart: "1", label: "Copy 1", underwriterName: "Baptist Healthcare", script: "x", durationSeconds: 30 },
      [{ ...existing, underwriter_id: null }],
      underwriters,
    );
    expect(match?.id).toBe("copy-1");
  });
});

describe("matchContentItem", () => {
  it("matches library titles by containment and ignores short titles", () => {
    const items = [
      { id: "ci-bird", title: "BirdNote" },
      { id: "ci-uf", title: "Unearthing Florida" },
    ];
    expect(matchContentItem("Birdnote Daily -Located in the Eco group DAD", items)?.id).toBe("ci-bird");
    expect(matchContentItem("Unearthing Florida", items)?.id).toBe("ci-uf");
    expect(matchContentItem("Take Meter Readings", items)).toBeNull();
  });
});

describe("buildProgramLogPlan", () => {
  it("plans one rundown per program with schedule-derived shifts", () => {
    const plan = buildProgramLogPlan(baseInputs());
    expect(plan.airDate).toBe("2026-08-21");
    const names = plan.rundowns.map((rundown) => rundown.programName);
    expect(names).toEqual(["BBC World Service", "Morning Edition"]);
    const me = plan.rundowns[1]!;
    expect(me.scheduleEntryId).toBe("sched-me");
    expect(me.shiftStartTime).toBe("05:00:00");
    expect(me.shiftDurationMinutes).toBe(240);
  });

  it("keeps Marketplace Morning unresolved when no schedule entry covers it", () => {
    const plan = buildProgramLogPlan(baseInputs());
    // The unresolved entry's description is the matched program's own
    // canonical name ("Marketplace Morning Report"), not the row's raw
    // printed text ("Marketplace Morning") — the program was successfully
    // matched by containment; it's the schedule lookup that fails.
    const marketplace = plan.unresolved.find((row) => row.description === "Marketplace Morning Report");
    expect(marketplace?.reason).toContain("No Log schedule entry");
  });

  it("flags an unmatched program-start row as unresolved rather than silently dropping its events", () => {
    const plan = buildProgramLogPlan({
      ...baseInputs(),
      parsed: {
        ...PARSED_FIXTURE,
        events: [
          event({ time: "10:00:00", kind: "program_start", description: "Some Unknown Show" }),
          event({ time: "10:05:00", kind: "content", description: "Whatever airs under it" }),
        ],
      },
    });
    expect(plan.unresolved.map((row) => row.reason)).toEqual([
      "Looks like a program start, but no Log program matches this name.",
      "Falls under an unrecognized program.",
    ]);
  });

  it("groups a covering avail with the standalone credit rows that fall inside its window", () => {
    const plan = buildProgramLogPlan(baseInputs());
    const me = plan.rundowns.find((rundown) => rundown.programId === "prog-me")!;
    const sixOhSix = me.breaks.find((brk) => brk.time === "06:06:00")!;
    expect(sixOhSix.availableDurationSeconds).toBe(90);
    expect(sixOhSix.items.map((item) => item.kind)).toEqual(["credit", "credit"]);
    expect(sixOhSix.items.map((item) => item.title)).toEqual([
      "Baptist Healthcare / Copy 1",
      "Clark,Partington,Hart,Larry,Bond & Stackhouse / CPH Law",
    ]);
  });

  it("resolves two credits bundled under one avail into two separate, attributed credit items", () => {
    const plan = buildProgramLogPlan(baseInputs());
    const me = plan.rundowns.find((rundown) => rundown.programId === "prog-me")!;
    const storyBreak = me.breaks.find((brk) => brk.time === "06:49:35")!;
    expect(storyBreak.availableDurationSeconds).toBe(115);
    expect(storyBreak.items).toEqual([
      {
        kind: "credit",
        copyKey: "|Juan's Flying Burrito|Live read",
        title: "Juan's Flying Burrito",
        durationSeconds: 30,
      },
      {
        kind: "credit",
        copyKey: "|Autumn Beck Blackledge|Live read",
        title: "Autumn Beck Blackledge",
        durationSeconds: 30,
      },
    ]);
  });

  it("gives a fill with no covering avail its own break", () => {
    const plan = buildProgramLogPlan({
      ...baseInputs(),
      contentItems: [{ id: "ci-uf", title: "Unearthing Florida" }],
    });
    const me = plan.rundowns.find((rundown) => rundown.programId === "prog-me")!;
    const unearthing = me.breaks.find((brk) => brk.label === "Unearthing Florida")!;
    expect(unearthing.time).toBe("07:33:00");
    expect(unearthing.items).toEqual([
      { kind: "content", contentItemId: "ci-uf", title: "Unearthing Florida", durationSeconds: 90 },
    ]);
    const birdnote = me.breaks
      .flatMap((brk) => brk.items)
      .find((item) => item.kind === "live_read" && item.title.includes("Birdnote"));
    expect(birdnote).toBeDefined();
  });

  it("flags a credit-kind row whose only credit failed verification (empty credits) rather than silently dropping it", () => {
    const plan = buildProgramLogPlan({
      ...baseInputs(),
      parsed: {
        ...PARSED_FIXTURE,
        events: [
          event({ time: "05:00:00", kind: "program_start", description: "Morning Edition" }),
          event({ time: "06:06:00", kind: "credit", description: "Baptist Healthcare / Copy 1", credits: [] }),
        ],
      },
    });
    expect(plan.unresolved.some((row) => row.reason.includes("couldn't be verified"))).toBe(true);
  });

  it("dedupes the day's credits into copy plans with airing counts", () => {
    const plan = buildProgramLogPlan(baseInputs());
    const fpl = plan.copyPlans.find((copy) => copy.underwriterName === "FPM - FL Power & Light");
    expect(fpl?.cart).toBe("47");
    expect(fpl?.label).toBe("copy 1");
    expect(fpl?.existingCopyId).toBeNull();
    expect(fpl?.underwriterIsNew).toBe(true);
    expect(fpl?.script).toContain("F P L");
    const baptist = plan.copyPlans.find((copy) => copy.key === "1|Baptist Healthcare|Copy 1");
    expect(baptist?.airings).toBe(1);
  });

  it("reuses existing copy and existing underwriters", () => {
    const inputs = baseInputs();
    inputs.underwriters = [{ id: "uw-baptist", name: "Baptist Healthcare" }];
    inputs.copy = [
      {
        id: "copy-baptist-1",
        underwriter_id: "uw-baptist",
        label: "Copy 1",
        cart_identifier: "1",
        script: "old text",
        duration_seconds: 30,
      },
    ];
    const plan = buildProgramLogPlan(inputs);
    const baptist = plan.copyPlans.find((copy) => copy.key === "1|Baptist Healthcare|Copy 1")!;
    expect(baptist.existingCopyId).toBe("copy-baptist-1");
    expect(baptist.scriptChanged).toBe(true);
    expect(baptist.underwriterIsNew).toBe(false);
  });

  it("marks a program whose rundown already exists instead of planning writes", () => {
    const inputs = baseInputs();
    inputs.existingRundowns = [{ id: "run-1", program_id: "prog-me", source: "imported" }];
    const plan = buildProgramLogPlan(inputs);
    const me = plan.rundowns.find((rundown) => rundown.programId === "prog-me")!;
    expect(me.existingRundownId).toBe("run-1");
    expect(me.existingRundownSource).toBe("imported");
  });

  it("collects operational notes separately", () => {
    const plan = buildProgramLogPlan(baseInputs());
    expect(plan.notes.some((note) => note.description === "Take Meter Readings")).toBe(true);
  });
});

describe("helpers", () => {
  it("round-trips clock times", () => {
    expect(clockTimeToSeconds("06:49:35")).toBe(24575);
    expect(secondsToClockTime(24575)).toBe("06:49:35");
  });

  it("permits every content type plus the two sentinels on imported breaks", () => {
    const types = importedBreakPermittedTypes();
    expect(types).toContain("underwriting_credit");
    expect(types).toContain("weather");
    expect(types).toContain("psa");
  });
});
