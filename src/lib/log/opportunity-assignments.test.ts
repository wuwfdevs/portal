import { describe, expect, it } from "vitest";
import {
  dayOfWeekForDateISO,
  planAssignedContentPlacements,
  selectApplicableAssignments,
  type ContentItemForPlacement,
  type InsertedBreakLike,
  type OpportunityAssignmentLike,
} from "./opportunity-assignments";
import type { RundownBreakDraft } from "./rundown-generation";

function assignment(
  overrides: Partial<OpportunityAssignmentLike> & { id: string; local_opportunity_id: string },
): OpportunityAssignmentLike {
  return {
    content_item_id: "content-1",
    hour_index: null,
    days_of_week: [],
    active: true,
    ...overrides,
  };
}

describe("dayOfWeekForDateISO", () => {
  it("returns 0 for a Sunday", () => {
    expect(dayOfWeekForDateISO("2026-08-09")).toBe(0);
  });

  it("returns 5 for a Friday", () => {
    expect(dayOfWeekForDateISO("2026-08-07")).toBe(5);
  });
});

describe("selectApplicableAssignments", () => {
  it("matches an assignment with no hour_index against any hour repetition", () => {
    const assignments = [assignment({ id: "a1", local_opportunity_id: "o1", hour_index: null })];
    expect(
      selectApplicableAssignments(assignments, { local_opportunity_id: "o1", hour_index: 3 }, 5),
    ).toHaveLength(1);
  });

  it("excludes an assignment pinned to a different hour repetition", () => {
    const assignments = [assignment({ id: "a1", local_opportunity_id: "o1", hour_index: 1 })];
    expect(
      selectApplicableAssignments(assignments, { local_opportunity_id: "o1", hour_index: 0 }, 5),
    ).toHaveLength(0);
  });

  it("matches an assignment pinned to the exact hour repetition", () => {
    const assignments = [assignment({ id: "a1", local_opportunity_id: "o1", hour_index: 1 })];
    expect(
      selectApplicableAssignments(assignments, { local_opportunity_id: "o1", hour_index: 1 }, 5),
    ).toHaveLength(1);
  });

  it("treats an empty days_of_week as every day", () => {
    const assignments = [assignment({ id: "a1", local_opportunity_id: "o1", days_of_week: [] })];
    expect(
      selectApplicableAssignments(assignments, { local_opportunity_id: "o1", hour_index: 0 }, 2),
    ).toHaveLength(1);
  });

  it("excludes an assignment restricted to days that don't include this one — Unearthing Florida's real 'Fridays only' case", () => {
    const assignments = [assignment({ id: "a1", local_opportunity_id: "o1", days_of_week: [5] })];
    // Wednesday (3)
    expect(
      selectApplicableAssignments(assignments, { local_opportunity_id: "o1", hour_index: 0 }, 3),
    ).toHaveLength(0);
    // Friday (5)
    expect(
      selectApplicableAssignments(assignments, { local_opportunity_id: "o1", hour_index: 0 }, 5),
    ).toHaveLength(1);
  });

  it("excludes an inactive assignment", () => {
    const assignments = [assignment({ id: "a1", local_opportunity_id: "o1", active: false })];
    expect(
      selectApplicableAssignments(assignments, { local_opportunity_id: "o1", hour_index: 0 }, 5),
    ).toHaveLength(0);
  });

  it("excludes an assignment for a different opportunity entirely", () => {
    const assignments = [assignment({ id: "a1", local_opportunity_id: "other" })];
    expect(
      selectApplicableAssignments(assignments, { local_opportunity_id: "o1", hour_index: 0 }, 5),
    ).toHaveLength(0);
  });

  it("returns more than one assignment when several genuinely apply to the same break", () => {
    const assignments = [
      assignment({ id: "a1", local_opportunity_id: "o1", content_item_id: "c1" }),
      assignment({ id: "a2", local_opportunity_id: "o1", content_item_id: "c2" }),
    ];
    expect(
      selectApplicableAssignments(assignments, { local_opportunity_id: "o1", hour_index: 0 }, 5),
    ).toHaveLength(2);
  });
});

function draft(overrides: Partial<RundownBreakDraft> & { local_opportunity_id: string }): RundownBreakDraft {
  return {
    hour_index: 0,
    position: 1,
    label: "Some break",
    requirement: "optional",
    permitted_content_types: [],
    scheduled_at: "2026-08-07T09:00:00.000Z",
    available_duration_seconds: 30,
    network_rejoin_at: "2026-08-07T09:00:30.000Z",
    ...overrides,
  };
}

function insertedBreak(overrides: Partial<InsertedBreakLike> & { id: string; local_opportunity_id: string }): InsertedBreakLike {
  return { scheduled_at: "2026-08-07T09:00:00.000Z", ...overrides };
}

describe("planAssignedContentPlacements", () => {
  const legalId: ContentItemForPlacement = { expected_duration_seconds: 10, components: [] };

  it("places the assigned content item into its matching break", () => {
    const rows = planAssignedContentPlacements(
      [insertedBreak({ id: "b1", local_opportunity_id: "o1" })],
      [draft({ local_opportunity_id: "o1" })],
      [assignment({ id: "a1", local_opportunity_id: "o1", content_item_id: "legal-id" })],
      new Map([["legal-id", legalId]]),
      "2026-08-07",
    );
    expect(rows).toEqual([
      {
        break_id: "b1",
        position: 1,
        item_kind: "content",
        content_item_id: "legal-id",
        planned_duration_seconds: 10,
        placement_status: "replaceable",
      },
    ]);
  });

  it("skips a break with no matching assignment", () => {
    const rows = planAssignedContentPlacements(
      [insertedBreak({ id: "b1", local_opportunity_id: "o1" })],
      [draft({ local_opportunity_id: "o1" })],
      [assignment({ id: "a1", local_opportunity_id: "other", content_item_id: "legal-id" })],
      new Map([["legal-id", legalId]]),
      "2026-08-07",
    );
    expect(rows).toHaveLength(0);
  });

  it("respects hour_index — Unearthing Florida's real 'second Morning Edition hour only' case", () => {
    const drafts = [
      draft({ local_opportunity_id: "o1", hour_index: 0, scheduled_at: "2026-08-07T09:00:00.000Z" }),
      draft({ local_opportunity_id: "o1", hour_index: 1, scheduled_at: "2026-08-07T10:00:00.000Z" }),
    ];
    const insertedBreaks = [
      insertedBreak({ id: "b0", local_opportunity_id: "o1", scheduled_at: "2026-08-07T09:00:00.000Z" }),
      insertedBreak({ id: "b1", local_opportunity_id: "o1", scheduled_at: "2026-08-07T10:00:00.000Z" }),
    ];
    const rows = planAssignedContentPlacements(
      insertedBreaks,
      drafts,
      [assignment({ id: "a1", local_opportunity_id: "o1", content_item_id: "unearthing-fl", hour_index: 1 })],
      new Map([["unearthing-fl", { expected_duration_seconds: 90, components: [] }]]),
      "2026-08-07",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.break_id).toBe("b1");
  });

  it("skips a day-of-week-restricted assignment on a day it doesn't cover", () => {
    const rows = planAssignedContentPlacements(
      [insertedBreak({ id: "b1", local_opportunity_id: "o1" })],
      [draft({ local_opportunity_id: "o1" })],
      [assignment({ id: "a1", local_opportunity_id: "o1", content_item_id: "unearthing-fl", days_of_week: [5] })],
      new Map([["unearthing-fl", { expected_duration_seconds: 90, components: [] }]]),
      "2026-08-05", // a Wednesday
    );
    expect(rows).toHaveLength(0);
  });

  it("skips an assignment whose content item wasn't supplied (deactivated/deleted since)", () => {
    const rows = planAssignedContentPlacements(
      [insertedBreak({ id: "b1", local_opportunity_id: "o1" })],
      [draft({ local_opportunity_id: "o1" })],
      [assignment({ id: "a1", local_opportunity_id: "o1", content_item_id: "missing" })],
      new Map(),
      "2026-08-07",
    );
    expect(rows).toHaveLength(0);
  });

  it("skips a content item that computes to a zero or null duration", () => {
    const rows = planAssignedContentPlacements(
      [insertedBreak({ id: "b1", local_opportunity_id: "o1" })],
      [draft({ local_opportunity_id: "o1" })],
      [assignment({ id: "a1", local_opportunity_id: "o1", content_item_id: "empty" })],
      new Map([["empty", { expected_duration_seconds: null, components: [] }]]),
      "2026-08-07",
    );
    expect(rows).toHaveLength(0);
  });

  it("dedupes two overlapping assignments that would place the same content item twice", () => {
    const rows = planAssignedContentPlacements(
      [insertedBreak({ id: "b1", local_opportunity_id: "o1" })],
      [draft({ local_opportunity_id: "o1" })],
      [
        assignment({ id: "a1", local_opportunity_id: "o1", content_item_id: "legal-id", hour_index: null }),
        assignment({ id: "a2", local_opportunity_id: "o1", content_item_id: "legal-id", days_of_week: [] }),
      ],
      new Map([["legal-id", legalId]]),
      "2026-08-07",
    );
    expect(rows).toHaveLength(1);
  });

  it("places distinct content items from two different assignments into positions 1 and 2 of the same break", () => {
    const rows = planAssignedContentPlacements(
      [insertedBreak({ id: "b1", local_opportunity_id: "o1" })],
      [draft({ local_opportunity_id: "o1" })],
      [
        assignment({ id: "a1", local_opportunity_id: "o1", content_item_id: "c1" }),
        assignment({ id: "a2", local_opportunity_id: "o1", content_item_id: "c2" }),
      ],
      new Map([
        ["c1", { expected_duration_seconds: 10, components: [] }],
        ["c2", { expected_duration_seconds: 20, components: [] }],
      ]),
      "2026-08-07",
    );
    expect(rows.map((row) => row.position)).toEqual([1, 2]);
    expect(rows.map((row) => row.content_item_id)).toEqual(["c1", "c2"]);
  });

  it("returns nothing when there are no assignments at all", () => {
    const rows = planAssignedContentPlacements(
      [insertedBreak({ id: "b1", local_opportunity_id: "o1" })],
      [draft({ local_opportunity_id: "o1" })],
      [],
      new Map(),
      "2026-08-07",
    );
    expect(rows).toHaveLength(0);
  });
});
