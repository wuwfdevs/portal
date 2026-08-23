import { describe, expect, it } from "vitest";
import { parseProgramLog } from "./program-log-import";
import { PROGRAM_LOG_FIXTURE_XML } from "./program-log-import.fixture";
import {
  buildProgramLogPlan,
  clockTimeToSeconds,
  importedBreakPermittedTypes,
  matchContentItem,
  matchCopy,
  matchProgram,
  secondsToClockTime,
  splitCreditDescription,
  type ProgramLogPlanInputs,
} from "./program-log-plan";

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

function baseInputs(): ProgramLogPlanInputs {
  return {
    parsed: parseProgramLog(PROGRAM_LOG_FIXTURE_XML),
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
    expect(matchProgram("Marketplace PM - Play through ENCO Programs Fader", [
      { id: "prog-mpm", name: "Marketplace PM" },
    ])?.id).toBe("prog-mpm");
    expect(matchProgram("1A", [{ id: "prog-1a", name: "1A" }])?.id).toBe("prog-1a");
    expect(matchProgram("UW Credit (01:00)", PROGRAMS)).toBeNull();
  });

  it("never containment-matches a too-short name", () => {
    expect(matchProgram("Marketplace Morning", [{ id: "x", name: "1A" }])).toBeNull();
  });
});

describe("splitCreditDescription", () => {
  it("splits underwriter and copy label on the last ' / '", () => {
    expect(splitCreditDescription("Baptist Healthcare / Copy 1")).toEqual({
      underwriterName: "Baptist Healthcare",
      label: "Copy 1",
    });
    expect(splitCreditDescription("Clark,Partington,Hart,Larry,Bond & Stackhouse / CPH Law")).toEqual({
      underwriterName: "Clark,Partington,Hart,Larry,Bond & Stackhouse",
      label: "CPH Law",
    });
    expect(splitCreditDescription("No Slash Sponsor")).toEqual({
      underwriterName: "No Slash Sponsor",
      label: "Imported copy",
    });
  });
});

describe("matchCopy", () => {
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
    const { match, scriptChanged } = matchCopy(
      {
        cart: "1",
        description: "Baptist Healthcare / Copy 1",
        script: "Local  support for WUWF is provided by Baptist Health Care.",
        lengthSeconds: 30,
      },
      [existing],
      underwriters,
    );
    expect(match?.id).toBe("copy-1");
    expect(scriptChanged).toBe(false);
  });

  it("flags a matched copy whose script text changed", () => {
    const { match, scriptChanged } = matchCopy(
      { cart: "1", description: "Baptist Healthcare / Copy 1", script: "Entirely new message.", lengthSeconds: 30 },
      [existing],
      underwriters,
    );
    expect(match?.id).toBe("copy-1");
    expect(scriptChanged).toBe(true);
  });

  it("rejects a cart collision under a different underwriter", () => {
    const { match } = matchCopy(
      { cart: "1", description: "Someone Else / Copy 1", script: "x", lengthSeconds: 30 },
      [existing],
      underwriters,
    );
    expect(match).toBeNull();
  });

  it("matches an unattributed copy row (contract-era, no underwriter_id) on cart + label", () => {
    const { match } = matchCopy(
      { cart: "1", description: "Baptist Healthcare / Copy 1", script: "x", lengthSeconds: 30 },
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

describe("buildProgramLogPlan against the real export's first two pages", () => {
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
    const marketplace = plan.unresolved.find((row) => row.description === "Marketplace Morning Report");
    expect(marketplace?.reason).toContain("No Log schedule entry");
  });

  it("turns avail markers into breaks and attaches same-window credits", () => {
    const plan = buildProgramLogPlan(baseInputs());
    const me = plan.rundowns.find((rundown) => rundown.programId === "prog-me")!;
    const sixOhSix = me.breaks.find((brk) => brk.time === "06:06:00")!;
    expect(sixOhSix.availableDurationSeconds).toBe(90);
    expect(sixOhSix.items.map((item) => item.kind)).toEqual(["credit", "credit"]);
    const storyBreak = me.breaks.find((brk) => brk.time === "06:49:35")!;
    expect(storyBreak.availableDurationSeconds).toBe(115);
    expect(storyBreak.items).toHaveLength(2);
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
    const birdnote = me.breaks.flatMap((brk) => brk.items).find(
      (item) => item.kind === "live_read" && item.title.includes("Birdnote"),
    );
    expect(birdnote).toBeDefined();
  });

  it("dedupes the day's credits into copy plans with airing counts", () => {
    const plan = buildProgramLogPlan(baseInputs());
    const fpl = plan.copyPlans.find((copy) => copy.underwriterName === "FPM - FL Power & Light");
    expect(fpl?.cart).toBe("47");
    expect(fpl?.label).toBe("copy 1");
    expect(fpl?.existingCopyId).toBeNull();
    expect(fpl?.underwriterIsNew).toBe(true);
    expect(fpl?.script).toContain("F P L");
    const baptist = plan.copyPlans.find((copy) => copy.key === "1|Baptist Healthcare / Copy 1");
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
    const baptist = plan.copyPlans.find((copy) => copy.key === "1|Baptist Healthcare / Copy 1")!;
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
