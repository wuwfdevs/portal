import { describe, expect, it } from "vitest";
import {
  buildRundownBreakDrafts,
  breakInsertRow,
  selectMissingBreakDrafts,
  type RundownOpportunityLike,
} from "./rundown-generation";

function opportunity(
  overrides: Partial<RundownOpportunityLike> & { id: string },
): RundownOpportunityLike {
  return {
    slot_id: `slot-${overrides.id}`,
    slot_position: 1,
    slot_label: "Local cover",
    requirement: "optional",
    timing_mode: "fixed",
    start_offset_seconds: 0,
    duration_seconds: 30,
    earliest_start_offset_seconds: null,
    latest_start_offset_seconds: null,
    permitted_content_types: [],
    ...overrides,
  };
}

describe("buildRundownBreakDrafts", () => {
  it("gives every opportunity a break, including optional ones (they still need to render as 'carrying network')", () => {
    const drafts = buildRundownBreakDrafts(
      [opportunity({ id: "o1", requirement: "optional" })],
      "2026-08-07T09:00:00.000Z",
      60,
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.requirement).toBe("optional");
  });

  it("places a single-hour shift's fixed opportunity at shift start + offset, rejoining at start + duration", () => {
    const drafts = buildRundownBreakDrafts(
      [opportunity({ id: "o1", slot_position: 1, start_offset_seconds: 90, duration_seconds: 30 })],
      "2026-08-07T09:00:00.000Z",
      60,
    );
    expect(drafts[0]).toMatchObject({
      local_opportunity_id: "o1",
      hour_index: 0,
      scheduled_at: "2026-08-07T09:01:30.000Z",
      available_duration_seconds: 30,
      network_rejoin_at: "2026-08-07T09:02:00.000Z",
    });
  });

  it("takes its label from the referenced slot, not an authored one", () => {
    const drafts = buildRundownBreakDrafts(
      [opportunity({ id: "o1", slot_label: "Music Bed" })],
      "2026-08-07T09:00:00.000Z",
      60,
    );
    expect(drafts[0]!.label).toBe("Music Bed");
  });

  it("falls back to a generic label when the slot has none", () => {
    const drafts = buildRundownBreakDrafts(
      [opportunity({ id: "o1", slot_label: null })],
      "2026-08-07T09:00:00.000Z",
      60,
    );
    expect(drafts[0]!.label).toBe("Local opportunity");
  });

  it("places a floating opportunity at its earliest permitted start and rejoins from its latest", () => {
    const drafts = buildRundownBreakDrafts(
      [
        opportunity({
          id: "o1",
          timing_mode: "float",
          start_offset_seconds: 1020,
          earliest_start_offset_seconds: 1020,
          latest_start_offset_seconds: 1800,
          duration_seconds: 90,
        }),
      ],
      "2026-08-07T09:00:00.000Z",
      60,
    );
    expect(drafts[0]!.scheduled_at).toBe("2026-08-07T09:17:00.000Z"); // 09:00 + 1020s
    expect(drafts[0]!.network_rejoin_at).toBe("2026-08-07T09:31:30.000Z"); // 09:00 + 1800 + 90s
  });

  it("repeats every opportunity once per hour across a multi-hour shift", () => {
    const drafts = buildRundownBreakDrafts(
      [opportunity({ id: "o1", slot_position: 1, start_offset_seconds: 60 })],
      "2026-08-07T05:00:00.000Z",
      240,
    );
    expect(drafts).toHaveLength(4);
    expect(drafts.map((d) => d.scheduled_at)).toEqual([
      "2026-08-07T05:01:00.000Z",
      "2026-08-07T06:01:00.000Z",
      "2026-08-07T07:01:00.000Z",
      "2026-08-07T08:01:00.000Z",
    ]);
  });

  it("rounds a partial final hour up rather than dropping its opportunities", () => {
    const drafts = buildRundownBreakDrafts(
      [opportunity({ id: "o1" })],
      "2026-08-07T09:00:00.000Z",
      90,
    );
    expect(drafts).toHaveLength(2);
  });

  it("a required opportunity left unused is still a break — unresolved-ness is derived later by timing.ts, not skipped here", () => {
    const drafts = buildRundownBreakDrafts(
      [opportunity({ id: "o1", requirement: "required" })],
      "2026-08-07T09:00:00.000Z",
      60,
    );
    expect(drafts[0]!.requirement).toBe("required");
  });

  it("keeps hour repetitions ordered ahead of same-hour opportunity slot position", () => {
    const drafts = buildRundownBreakDrafts(
      [opportunity({ id: "o1", slot_position: 1 }), opportunity({ id: "o2", slot_position: 5 })],
      "2026-08-07T09:00:00.000Z",
      120,
    );
    const positions = drafts.map((d) => d.position);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

describe("selectMissingBreakDrafts", () => {
  it("keeps every draft when the rundown has no existing breaks yet", () => {
    const drafts = buildRundownBreakDrafts(
      [opportunity({ id: "o1" }), opportunity({ id: "o2", slot_position: 2 })],
      "2026-08-07T09:00:00.000Z",
      60,
    );
    expect(selectMissingBreakDrafts(drafts, [])).toHaveLength(2);
  });

  it("drops a draft whose slot occurrence already has a break (a rundown generated before this opportunity existed)", () => {
    const drafts = buildRundownBreakDrafts(
      [opportunity({ id: "o1" }), opportunity({ id: "o2", slot_position: 2 })],
      "2026-08-07T09:00:00.000Z",
      60,
    );
    const missing = selectMissingBreakDrafts(drafts, [{ clock_slot_id: "slot-o1", hour_index: 0 }]);
    expect(missing).toHaveLength(1);
    expect(missing[0]!.local_opportunity_id).toBe("o2");
  });

  it("matches on slot and hour together — the same slot in another hour is a different break", () => {
    const drafts = buildRundownBreakDrafts(
      [opportunity({ id: "o1" })],
      "2026-08-07T09:00:00.000Z",
      120,
    );
    const missing = selectMissingBreakDrafts(drafts, [{ clock_slot_id: "slot-o1", hour_index: 0 }]);
    expect(missing.map((draft) => draft.hour_index)).toEqual([1]);
  });

  it("treats a break an import already placed on the slot as present, whatever its times", () => {
    // An unmarked slot the import put a credit in, marked eligible later:
    // the break exists already, so sync adds nothing.
    const drafts = buildRundownBreakDrafts(
      [opportunity({ id: "o1" })],
      "2026-08-07T09:00:00.000Z",
      60,
    );
    expect(
      selectMissingBreakDrafts(drafts, [{ clock_slot_id: "slot-o1", hour_index: 0 }]),
    ).toHaveLength(0);
  });
});

describe("breakInsertRow", () => {
  it("writes the occurrence key and the opportunity's snapshot, never times the trigger derives", () => {
    const [draft] = buildRundownBreakDrafts(
      [opportunity({ id: "o1", start_offset_seconds: 90, permitted_content_types: ["psa"] })],
      "2026-08-07T09:00:00.000Z",
      60,
    );
    expect(breakInsertRow(draft!, "r1")).toEqual({
      rundown_id: "r1",
      clock_slot_id: "slot-o1",
      hour_index: 0,
      local_opportunity_id: "o1",
      requirement: "optional",
      permitted_content_types: ["psa"],
    });
  });
});
