import { describe, expect, it } from "vitest";
import { buildRundownItemDrafts, defaultRequirementLevel, type RundownSlotLike } from "./rundown-generation";

function slot(overrides: Partial<RundownSlotLike> & { id: string }): RundownSlotLike {
  return {
    position: 1,
    start_offset_seconds: 0,
    duration_seconds: 30,
    fill_mode: "host_fillable",
    ...overrides,
  };
}

describe("defaultRequirementLevel", () => {
  it("maps host_fillable to required — the break must be filled with something", () => {
    expect(defaultRequirementLevel("host_fillable")).toBe("required");
  });

  it("maps optional to optional", () => {
    expect(defaultRequirementLevel("optional")).toBe("optional");
  });

  it("maps required (network feed) to required too, though generation never emits a row for it", () => {
    expect(defaultRequirementLevel("required")).toBe("required");
  });
});

describe("buildRundownItemDrafts", () => {
  it("excludes required (network-automatic) slots entirely", () => {
    const slots = [slot({ id: "s1", fill_mode: "required" })];
    expect(buildRundownItemDrafts(slots, "2026-08-07T09:00:00.000Z", 60)).toHaveLength(0);
  });

  it("places a single-hour shift's slots at shift start + offset", () => {
    const slots = [
      slot({ id: "s1", position: 1, start_offset_seconds: 90, duration_seconds: 30, fill_mode: "host_fillable" }),
    ];
    const drafts = buildRundownItemDrafts(slots, "2026-08-07T09:00:00.000Z", 60);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      clock_slot_id: "s1",
      hour_index: 0,
      scheduled_at: "2026-08-07T09:01:30.000Z",
      planned_duration_seconds: 30,
      requirement_level: "required",
    });
  });

  it("repeats every host-decided slot once per hour across a multi-hour shift", () => {
    const slots = [slot({ id: "s1", position: 1, start_offset_seconds: 60, fill_mode: "optional" })];
    const drafts = buildRundownItemDrafts(slots, "2026-08-07T05:00:00.000Z", 240);
    expect(drafts).toHaveLength(4);
    expect(drafts.map((d) => d.scheduled_at)).toEqual([
      "2026-08-07T05:01:00.000Z",
      "2026-08-07T06:01:00.000Z",
      "2026-08-07T07:01:00.000Z",
      "2026-08-07T08:01:00.000Z",
    ]);
    expect(drafts.every((d) => d.requirement_level === "optional")).toBe(true);
  });

  it("rounds a partial final hour up rather than dropping its slots", () => {
    const slots = [slot({ id: "s1" })];
    expect(buildRundownItemDrafts(slots, "2026-08-07T09:00:00.000Z", 90)).toHaveLength(2);
  });

  it("keeps hour repetitions ordered ahead of same-hour slot position, given slots in position order", () => {
    const slots = [
      slot({ id: "s1", position: 1 }),
      slot({ id: "s2", position: 5 }),
    ];
    const drafts = buildRundownItemDrafts(slots, "2026-08-07T09:00:00.000Z", 120);
    const positions = drafts.map((d) => d.position);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
