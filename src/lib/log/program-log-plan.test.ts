import { describe, expect, it } from "vitest";
import {
  assembleProgramLogPlan,
  buildPlanOutputSchema,
  clockTimeToSeconds,
  importedBreakPermittedTypes,
  NEW_UNDERWRITER,
  secondsToClockTime,
  type AssembleInputs,
  type ModelItem,
  type ProgramLogModelOutput,
} from "./program-log-plan";

// The model's own reading of a document is not something a unit test can
// exercise (program-log-ai-import.ts is the network call). What this module
// owns — resolving the ids the model named against the lists the tools
// served, grouping credits into copy plans, counting airings from what will
// be placed — is tested by handing it model output built by hand.

const SCHEDULE = [
  {
    id: "sched-me",
    program_id: "prog-me",
    program_name: "Morning Edition",
    clock_template_id: "clock-me",
    air_time: "05:00:00",
    duration_minutes: 240,
    entry_type: "recurring" as const,
    days_of_week: [1, 2, 3, 4, 5],
    start_date: "2026-01-01",
    end_date: null,
  },
  {
    id: "sched-bbc",
    program_id: "prog-bbc",
    program_name: "BBC World Service",
    clock_template_id: "clock-bbc",
    air_time: "00:00:00",
    duration_minutes: 300,
    entry_type: "recurring" as const,
    days_of_week: [1, 2, 3, 4, 5],
    start_date: "2026-01-01",
    end_date: null,
  },
];

const UNDERWRITERS = [
  { id: "uw-baptist", name: "Baptist Healthcare" },
  { id: "uw-fcac", name: "First City Art Center" },
];

const COPY = [
  {
    id: "copy-baptist-1",
    underwriter_id: "uw-baptist",
    label: "Copy 1",
    cart_identifier: "1",
    script: "Local support for WUWF is provided by Baptist Health Care.",
    duration_seconds: 30,
  },
];

const CONTENT = [{ id: "ci-birdnote", title: "BirdNote Daily", content_type: "interview_feature" }];

function item(partial: Partial<ModelItem> & Pick<ModelItem, "kind">): ModelItem {
  return {
    underwriter: null,
    new_underwriter_name: null,
    existing_copy_id: null,
    label: null,
    cart: null,
    script: null,
    content_item_id: null,
    title: null,
    duration_seconds: null,
    ...partial,
  };
}

function inputs(
  output: ProgramLogModelOutput,
  overrides: Partial<AssembleInputs> = {},
): AssembleInputs {
  return {
    output,
    scheduleEntries: SCHEDULE,
    existingRundowns: [],
    underwriters: UNDERWRITERS,
    copy: COPY,
    contentItems: CONTENT,
    ...overrides,
  };
}

const BAPTIST_EXISTING = item({
  kind: "credit",
  underwriter: "Baptist Healthcare",
  existing_copy_id: "copy-baptist-1",
  label: "Copy 1",
  cart: "1",
  script: "Local support for WUWF is provided by Baptist Health Care.",
  duration_seconds: 30,
});

const FIRST_CITY_NEW = item({
  kind: "credit",
  underwriter: "First City Art Center",
  label: "Car Pool",
  cart: "105",
  script: "Support for WUWF comes from First City Art Center announcing its Pumpkin Patch.",
  duration_seconds: 30,
});

const DAY: ProgramLogModelOutput = {
  air_date: "2026-09-22",
  rundowns: [
    {
      schedule_entry_id: "sched-me",
      program_name: "Morning Edition",
      breaks: [
        {
          time: "06:06:00",
          label: "Underwriting break",
          window_seconds: 90,
          items: [BAPTIST_EXISTING, FIRST_CITY_NEW],
        },
        {
          time: "07:42:30",
          label: "BirdNote Daily",
          window_seconds: null,
          items: [
            item({
              kind: "content",
              content_item_id: "ci-birdnote",
              title: "Birdnote Daily -Located in the Eco group DAD",
              duration_seconds: 90,
            }),
          ],
        },
        {
          time: "08:06:00",
          label: "Underwriting break",
          window_seconds: 90,
          items: [FIRST_CITY_NEW],
        },
      ],
    },
    {
      schedule_entry_id: "sched-bbc",
      program_name: "BBC World Service",
      breaks: [{ time: "00:06:00", label: "Underwriting break", window_seconds: 30, items: [] }],
    },
  ],
  unresolved: [],
  notes: [{ time: "05:00:00", description: "Take Meter Readings" }],
};

describe("assembleProgramLogPlan", () => {
  it("resolves each rundown from its schedule entry and keeps breaks and items as the model placed them", () => {
    const plan = assembleProgramLogPlan(inputs(DAY));
    expect(plan.airDate).toBe("2026-09-22");
    expect(plan.rundowns.map((rundown) => rundown.programName)).toEqual([
      "BBC World Service",
      "Morning Edition",
    ]);

    const me = plan.rundowns[1]!;
    expect(me).toMatchObject({
      programId: "prog-me",
      scheduleEntryId: "sched-me",
      clockTemplateId: "clock-me",
      shiftStartTime: "05:00:00",
      shiftDurationMinutes: 240,
      existingRundownId: null,
    });
    expect(
      me.breaks.map((brk) => [brk.time, brk.startSeconds, brk.availableDurationSeconds]),
    ).toEqual([
      ["06:06:00", 21960, 90],
      ["07:42:30", 27750, 90],
      ["08:06:00", 29160, 90],
    ]);
    expect(me.breaks[0]!.items.map((row) => row.title)).toEqual([
      "Baptist Healthcare / Copy 1",
      "First City Art Center / Car Pool",
    ]);
    expect(me.breaks[1]!.items).toEqual([
      {
        kind: "content",
        contentItemId: "ci-birdnote",
        title: "BirdNote Daily",
        durationSeconds: 90,
      },
    ]);
    expect(plan.notes).toEqual([{ time: "05:00:00", description: "Take Meter Readings" }]);
    expect(plan.warnings).toEqual([]);
  });

  it("groups credits into copy plans, reusing existing copy and counting airings from placed items", () => {
    const plan = assembleProgramLogPlan(inputs(DAY));
    expect(plan.copyPlans).toHaveLength(2);

    const baptist = plan.copyPlans.find((copy) => copy.underwriterName === "Baptist Healthcare")!;
    expect(baptist).toMatchObject({
      key: "copy:copy-baptist-1",
      existingCopyId: "copy-baptist-1",
      underwriterIsNew: false,
      scriptChanged: false,
      libraryScript: COPY[0]!.script,
      airings: 1,
    });

    const firstCity = plan.copyPlans.find(
      (copy) => copy.underwriterName === "First City Art Center",
    )!;
    expect(firstCity).toMatchObject({
      key: "new:firstcityartcenter|car pool|105",
      existingCopyId: null,
      underwriterIsNew: false,
      cart: "105",
      label: "Car Pool",
      airings: 2,
    });
    expect(firstCity.script).toContain("Pumpkin Patch");

    const me = plan.rundowns.find((rundown) => rundown.programId === "prog-me")!;
    const keys = me.breaks
      .flatMap((brk) => brk.items)
      .flatMap((row) => (row.kind === "credit" ? [row.copyKey] : []));
    expect(keys).toEqual([
      "copy:copy-baptist-1",
      "new:firstcityartcenter|car pool|105",
      "new:firstcityartcenter|car pool|105",
    ]);
  });

  it("flags reused copy whose script differs from the library's", () => {
    const changed: ProgramLogModelOutput = {
      ...DAY,
      rundowns: [
        {
          schedule_entry_id: "sched-me",
          program_name: "Morning Edition",
          breaks: [
            {
              time: "06:06:00",
              label: "Underwriting break",
              window_seconds: 90,
              items: [
                {
                  ...BAPTIST_EXISTING,
                  script: "Local support for WUWF is provided by Baptist Health Care. New tag.",
                },
              ],
            },
          ],
        },
      ],
    };
    const plan = assembleProgramLogPlan(inputs(changed));
    expect(plan.copyPlans[0]!.scriptChanged).toBe(true);
    // The export's wording is what will be written; the library's is kept
    // alongside so the preview can show what the update replaces.
    expect(plan.copyPlans[0]!.script).toBe(
      "Local support for WUWF is provided by Baptist Health Care. New tag.",
    );
    expect(plan.copyPlans[0]!.libraryScript).toBe(COPY[0]!.script);
  });

  it("joins the PDF column's line wraps back into one line, and repairs a library row that kept them", () => {
    const oneBreak = (items: ModelItem[]): ProgramLogModelOutput => ({
      ...DAY,
      rundowns: [
        {
          schedule_entry_id: "sched-me",
          program_name: "Morning Edition",
          breaks: [{ time: "06:06:00", label: "Underwriting break", window_seconds: 90, items }],
        },
      ],
    });
    const wrapped = item({
      kind: "credit",
      underwriter: NEW_UNDERWRITER,
      new_underwriter_name: "Juan's Flying Burrito",
      script: "Support for WUWF comes\nfrom Juan's Flying\n  Burrito.\n",
    });
    const fresh = assembleProgramLogPlan(inputs(oneBreak([wrapped])));
    expect(fresh.copyPlans[0]!.script).toBe("Support for WUWF comes from Juan's Flying Burrito.");

    // Same words as the library, but the library row still carries wraps
    // from an earlier import: flagged, so the import rewrites it clean.
    const damaged = [
      { ...COPY[0]!, script: "Local support for WUWF is\nprovided by Baptist Health Care." },
    ];
    const repaired = assembleProgramLogPlan(
      inputs(oneBreak([BAPTIST_EXISTING]), { copy: damaged }),
    );
    expect(repaired.copyPlans[0]!.scriptChanged).toBe(true);
    expect(repaired.copyPlans[0]!.script).toBe(
      "Local support for WUWF is provided by Baptist Health Care.",
    );

    // A clean library row and a wrapped export of the same words: no update.
    const unchanged = assembleProgramLogPlan(
      inputs(
        oneBreak([
          {
            ...BAPTIST_EXISTING,
            script: "Local support for WUWF is provided\nby Baptist Health Care.",
          },
        ]),
      ),
    );
    expect(unchanged.copyPlans[0]!.scriptChanged).toBe(false);
  });

  it("creates a NEW underwriter's credit, but reuses a known underwriter the model marked NEW by mistake", () => {
    const output: ProgramLogModelOutput = {
      ...DAY,
      rundowns: [
        {
          schedule_entry_id: "sched-me",
          program_name: "Morning Edition",
          breaks: [
            {
              time: "06:06:00",
              label: "Underwriting break",
              window_seconds: 90,
              items: [
                item({
                  kind: "credit",
                  underwriter: NEW_UNDERWRITER,
                  new_underwriter_name: "Juan's Flying Burrito",
                  label: "Live read",
                  script: "Support for WUWF comes from Juan's Flying Burrito.",
                }),
                item({
                  kind: "credit",
                  underwriter: NEW_UNDERWRITER,
                  new_underwriter_name: "first city art center",
                  label: "Car Pool",
                  script: "…",
                }),
                item({
                  kind: "credit",
                  underwriter: NEW_UNDERWRITER,
                  new_underwriter_name: "   ",
                  label: "Live read",
                  script: "…",
                }),
              ],
            },
          ],
        },
      ],
    };
    const plan = assembleProgramLogPlan(inputs(output));
    expect(plan.copyPlans.map((copy) => [copy.underwriterName, copy.underwriterIsNew])).toEqual([
      ["Juan's Flying Burrito", true],
      ["First City Art Center", false],
    ]);
    expect(plan.rundowns[0]!.breaks[0]!.items).toHaveLength(2);
    expect(plan.warnings).toEqual([
      "A credit at 06:06:00 named no underwriter and was not imported.",
    ]);
  });

  it("refuses copy that belongs to another underwriter or isn't in the library, creating new copy instead", () => {
    const output: ProgramLogModelOutput = {
      ...DAY,
      rundowns: [
        {
          schedule_entry_id: "sched-me",
          program_name: "Morning Edition",
          breaks: [
            {
              time: "06:06:00",
              label: "Underwriting break",
              window_seconds: 90,
              items: [
                { ...FIRST_CITY_NEW, existing_copy_id: "copy-baptist-1" },
                { ...BAPTIST_EXISTING, existing_copy_id: "copy-gone" },
              ],
            },
          ],
        },
      ],
    };
    const plan = assembleProgramLogPlan(inputs(output));
    expect(plan.copyPlans.map((copy) => copy.existingCopyId)).toEqual([null, null]);
    expect(plan.warnings).toHaveLength(2);
    expect(plan.warnings[0]).toContain("another underwriter's copy");
    expect(plan.warnings[1]).toContain("isn't in the library");
  });

  it("keeps a fill whose library id isn't real as a live read, and a live read as itself", () => {
    const output: ProgramLogModelOutput = {
      ...DAY,
      rundowns: [
        {
          schedule_entry_id: "sched-me",
          program_name: "Morning Edition",
          breaks: [
            {
              time: "07:33:00",
              label: "Unearthing Florida",
              window_seconds: null,
              items: [
                item({
                  kind: "content",
                  content_item_id: "ci-nope",
                  title: "Unearthing Florida",
                  duration_seconds: 90,
                }),
                item({
                  kind: "live_read",
                  title: "Smart Speaker",
                  script: "Ask your smart speaker to play WUWF.",
                  duration_seconds: 15,
                }),
              ],
            },
          ],
        },
      ],
    };
    const plan = assembleProgramLogPlan(inputs(output));
    expect(plan.rundowns[0]!.breaks[0]!.items).toEqual([
      { kind: "live_read", title: "Unearthing Florida", durationSeconds: 90, script: null },
      {
        kind: "live_read",
        title: "Smart Speaker",
        durationSeconds: 15,
        script: "Ask your smart speaker to play WUWF.",
      },
    ]);
    expect(plan.warnings[0]).toContain("kept as a live read");
    // No window printed → the items' own lengths are the window.
    expect(plan.rundowns[0]!.breaks[0]!.availableDurationSeconds).toBe(105);
  });

  it("lists a rundown whose schedule entry the tools never offered as unresolved, and a malformed break time too", () => {
    const output: ProgramLogModelOutput = {
      ...DAY,
      rundowns: [
        {
          schedule_entry_id: "sched-unknown",
          program_name: "Some Show",
          breaks: [{ time: "10:00:00", label: "x", window_seconds: null, items: [] }],
        },
        {
          schedule_entry_id: "sched-me",
          program_name: "Morning Edition",
          breaks: [
            { time: "six oh six", label: "Underwriting break", window_seconds: 90, items: [] },
          ],
        },
      ],
    };
    const plan = assembleProgramLogPlan(inputs(output));
    expect(plan.rundowns).toHaveLength(1);
    expect(plan.rundowns[0]!.breaks).toEqual([]);
    expect(plan.unresolved.map((row) => row.description)).toEqual([
      "Some Show",
      "Underwriting break",
    ]);
  });

  it("merges a program the model reported as two rundowns, since a program has one rundown per date", () => {
    const output: ProgramLogModelOutput = {
      ...DAY,
      rundowns: [
        {
          schedule_entry_id: "sched-me",
          program_name: "Morning Edition",
          breaks: [
            { time: "08:06:00", label: "Underwriting break", window_seconds: 90, items: [] },
          ],
        },
        {
          schedule_entry_id: "sched-me",
          program_name: "Morning Edition",
          breaks: [
            { time: "06:06:00", label: "Underwriting break", window_seconds: 90, items: [] },
          ],
        },
      ],
    };
    const plan = assembleProgramLogPlan(inputs(output));
    expect(plan.rundowns).toHaveLength(1);
    expect(plan.rundowns[0]!.breaks.map((brk) => brk.time)).toEqual(["06:06:00", "08:06:00"]);
    expect(plan.warnings[0]).toContain("combined into one rundown");
  });

  it("marks a program whose rundown already exists instead of planning writes, and reports an unreadable date", () => {
    const plan = assembleProgramLogPlan(
      inputs(DAY, {
        existingRundowns: [{ id: "run-1", program_id: "prog-me", source: "imported" }],
      }),
    );
    const me = plan.rundowns.find((rundown) => rundown.programId === "prog-me")!;
    expect(me.existingRundownId).toBe("run-1");
    expect(me.existingRundownSource).toBe("imported");

    const undated = assembleProgramLogPlan(inputs({ ...DAY, air_date: "Tuesday" }));
    expect(undated.airDate).toBe("");
    expect(undated.warnings[0]).toContain("air date could not be read");
  });
});

describe("buildPlanOutputSchema", () => {
  it("closes the underwriter set to the names on file plus NEW", () => {
    const schema = buildPlanOutputSchema(["Baptist Healthcare"]);
    const itemSchema =
      schema.properties.rundowns.items.properties.breaks.items.properties.items.items;
    expect(itemSchema.properties.underwriter.anyOf[0]).toEqual({
      type: "string",
      enum: ["Baptist Healthcare", NEW_UNDERWRITER],
    });
    expect(itemSchema.required).toEqual(Object.keys(itemSchema.properties));
    expect(schema.additionalProperties).toBe(false);
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
