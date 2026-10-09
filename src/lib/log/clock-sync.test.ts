import { describe, expect, it } from "vitest";
import {
  expectedShift,
  findOutOfStepRundowns,
  type SyncEntry,
  type SyncRundown,
} from "./clock-sync";

const NOW = "2026-09-01T12:00:00Z";

function entry(overrides: Partial<SyncEntry> = {}): SyncEntry {
  return {
    id: "recurring",
    program_id: "atc",
    entry_type: "recurring",
    days_of_week: [],
    start_date: "2026-01-01",
    end_date: null,
    clock_template_id: "normal-clock",
    air_time: "15:00:00",
    duration_minutes: 120,
    ...overrides,
  };
}

const storm = entry({
  id: "storm",
  entry_type: "override",
  start_date: "2026-09-10",
  end_date: "2026-09-12",
  clock_template_id: "fpren-atc",
});

function rundown(airDate: string, overrides: Partial<SyncRundown> = {}): SyncRundown {
  const shift = expectedShift(entry(), airDate);
  return {
    id: `r-${airDate}`,
    air_date: airDate,
    status: "generated",
    source: "generated",
    shift_start_at: shift.startAt,
    shift_end_at: shift.endAt,
    superseded_at: null,
    clockTemplateId: "normal-clock",
    ...overrides,
  };
}

describe("findOutOfStepRundowns", () => {
  it("reports a rundown generated before a one-time change covered its date", () => {
    const found = findOutOfStepRundowns([rundown("2026-09-11")], [entry(), storm], NOW);
    expect(found).toHaveLength(1);
    expect(found[0]?.entry.id).toBe("storm");
    expect(found[0]?.reason).toBe("clock");
  });

  it("leaves rundowns outside the change alone", () => {
    const found = findOutOfStepRundowns(
      [rundown("2026-09-09"), rundown("2026-09-13")],
      [entry(), storm],
      NOW,
    );
    expect(found).toEqual([]);
  });

  it("reports rundowns on the storm clock once the change is shortened or removed", () => {
    const onStorm = rundown("2026-09-11", { clockTemplateId: "fpren-atc" });
    const found = findOutOfStepRundowns([onStorm], [entry()], NOW);
    expect(found[0]?.entry.id).toBe("recurring");
    expect(found[0]?.reason).toBe("clock");
  });

  it("does nothing when the rundown already matches", () => {
    const shift = expectedShift(storm, "2026-09-11");
    const matching = rundown("2026-09-11", {
      clockTemplateId: "fpren-atc",
      shift_start_at: shift.startAt,
      shift_end_at: shift.endAt,
    });
    expect(findOutOfStepRundowns([matching], [entry(), storm], NOW)).toEqual([]);
  });

  it("reports different shift times on the same clock", () => {
    const later = entry({ id: "later", air_time: "16:00:00" });
    const found = findOutOfStepRundowns([rundown("2026-09-11")], [later], NOW);
    expect(found[0]?.reason).toBe("times");
  });

  it("never reports a rundown that has started, aired, been replaced, or was imported", () => {
    const entries = [entry(), storm];
    expect(
      findOutOfStepRundowns([rundown("2026-09-11", { status: "in_progress" })], entries, NOW),
    ).toEqual([]);
    expect(
      findOutOfStepRundowns([rundown("2026-09-11", { status: "submitted" })], entries, NOW),
    ).toEqual([]);
    expect(
      findOutOfStepRundowns(
        [rundown("2026-09-11", { superseded_at: "2026-09-02T00:00:00Z" })],
        entries,
        NOW,
      ),
    ).toEqual([]);
    expect(
      findOutOfStepRundowns([rundown("2026-09-11", { source: "imported" })], entries, NOW),
    ).toEqual([]);
  });

  it("never reports a rundown whose shift has already begun", () => {
    const started = rundown("2026-09-11", { shift_start_at: "2026-09-01T11:00:00Z" });
    expect(findOutOfStepRundowns([started], [entry(), storm], NOW)).toEqual([]);
  });

  it("skips a date with no entry in force", () => {
    const only = entry({ start_date: "2026-12-01" });
    expect(findOutOfStepRundowns([rundown("2026-09-11")], [only], NOW)).toEqual([]);
  });

  it("returns the earliest date first", () => {
    const found = findOutOfStepRundowns(
      [rundown("2026-09-12"), rundown("2026-09-10")],
      [entry(), storm],
      NOW,
    );
    expect(found.map((item) => item.rundown.air_date)).toEqual(["2026-09-10", "2026-09-12"]);
  });
});
