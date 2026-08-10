import { describe, expect, it } from "vitest";
import {
  buildRundownBreakDrafts,
  selectLegalIdBreakDraftsPerHour,
  selectMissingBreakDrafts,
  type RundownBreakDraft,
  type RundownOpportunityLike,
} from "./rundown-generation";

function opportunity(overrides: Partial<RundownOpportunityLike> & { id: string }): RundownOpportunityLike {
  return {
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
    const drafts = buildRundownBreakDrafts([opportunity({ id: "o1" })], "2026-08-07T09:00:00.000Z", 90);
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

  it("drops a draft that already has a matching break (a rundown generated before this opportunity existed)", () => {
    const drafts = buildRundownBreakDrafts(
      [opportunity({ id: "o1" }), opportunity({ id: "o2", slot_position: 2 })],
      "2026-08-07T09:00:00.000Z",
      60,
    );
    const missing = selectMissingBreakDrafts(drafts, [
      { local_opportunity_id: "o1", scheduled_at: drafts[0]!.scheduled_at },
    ]);
    expect(missing).toHaveLength(1);
    expect(missing[0]!.local_opportunity_id).toBe("o2");
  });

  it("matches on opportunity id and scheduled time together, not either alone", () => {
    const drafts = buildRundownBreakDrafts([opportunity({ id: "o1" })], "2026-08-07T09:00:00.000Z", 60);
    // Same opportunity id, different scheduled_at (e.g. a different hour repetition) — not a match.
    const missing = selectMissingBreakDrafts(drafts, [
      { local_opportunity_id: "o1", scheduled_at: "2026-08-07T10:00:00.000Z" },
    ]);
    expect(missing).toHaveLength(1);
  });

  it("returns nothing when every draft already has a matching break", () => {
    const drafts = buildRundownBreakDrafts([opportunity({ id: "o1" })], "2026-08-07T09:00:00.000Z", 60);
    const missing = selectMissingBreakDrafts(drafts, [
      { local_opportunity_id: "o1", scheduled_at: drafts[0]!.scheduled_at },
    ]);
    expect(missing).toHaveLength(0);
  });

  it("matches the same instant even when it's formatted differently than a fresh draft's toISOString() — the confirmed production bug", () => {
    // A value read back from Postgres via supabase-js renders a timestamptz
    // with no milliseconds and "+00:00" instead of "Z" — a real, different
    // string from what Date.prototype.toISOString() produces for the exact
    // same instant. Comparing those strings directly (the original bug)
    // made every already-synced break look "missing" on every call.
    const drafts = buildRundownBreakDrafts([opportunity({ id: "o1", start_offset_seconds: 90 })], "2026-08-07T09:00:00.000Z", 60);
    expect(drafts[0]!.scheduled_at).toBe("2026-08-07T09:01:30.000Z");
    const missing = selectMissingBreakDrafts(drafts, [
      { local_opportunity_id: "o1", scheduled_at: "2026-08-07T09:01:30+00:00" },
    ]);
    expect(missing).toHaveLength(0);
  });
});

function breakDraft(overrides: Partial<RundownBreakDraft> & { local_opportunity_id: string }): RundownBreakDraft {
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

describe("selectLegalIdBreakDraftsPerHour", () => {
  it("picks the draft whose network_rejoin_at is latest within each hour", () => {
    const drafts = [
      breakDraft({ local_opportunity_id: "o1", hour_index: 0, network_rejoin_at: "2026-08-07T09:20:00.000Z" }),
      breakDraft({ local_opportunity_id: "o2", hour_index: 0, network_rejoin_at: "2026-08-07T09:58:30.000Z" }),
      breakDraft({ local_opportunity_id: "o3", hour_index: 0, network_rejoin_at: "2026-08-07T09:45:00.000Z" }),
    ];
    const picked = selectLegalIdBreakDraftsPerHour(drafts);
    expect(picked).toHaveLength(1);
    expect(picked[0]!.local_opportunity_id).toBe("o2");
  });

  it("picks one per hour across a multi-hour shift", () => {
    const drafts = [
      breakDraft({ local_opportunity_id: "o1", hour_index: 0, network_rejoin_at: "2026-08-07T09:58:00.000Z" }),
      breakDraft({ local_opportunity_id: "o1", hour_index: 1, network_rejoin_at: "2026-08-07T10:58:00.000Z" }),
    ];
    const picked = selectLegalIdBreakDraftsPerHour(drafts);
    expect(picked.map((d) => d.hour_index).sort()).toEqual([0, 1]);
  });

  it("returns nothing for an empty draft set", () => {
    expect(selectLegalIdBreakDraftsPerHour([])).toHaveLength(0);
  });
});
