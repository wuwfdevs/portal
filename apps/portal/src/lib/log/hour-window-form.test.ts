import { describe, expect, it } from "vitest";
import {
  hoursPagePath,
  overlapMessage,
  parseChangeForm,
  parseWeeklyWindowForm,
} from "./hour-window-form";

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
}

describe("parseWeeklyWindowForm", () => {
  it("reads days, times, dates, and a trimmed note", () => {
    const parsed = parseWeeklyWindowForm(
      form({
        day: ["1", "2", "2", "9"],
        start_time: "05:00",
        end_time: "17:00",
        effective_from: "2026-10-05",
        effective_to: "",
        reason: "  Daytime  ",
      }),
    );
    expect(parsed).toEqual({
      ok: true,
      fields: {
        days_of_week: [1, 2],
        start_time: "05:00:00",
        end_time: "17:00:00",
        effective_from: "2026-10-05",
        effective_to: null,
        reason: "Daytime",
      },
    });
  });

  it("refuses no days, a bad time, equal times, and an end before the start", () => {
    const base = {
      day: "1",
      start_time: "05:00",
      end_time: "17:00",
      effective_from: "2026-10-05",
    };
    expect(parseWeeklyWindowForm(form({ ...base, day: [] }))).toMatchObject({ ok: false });
    expect(parseWeeklyWindowForm(form({ ...base, start_time: "25:00" }))).toMatchObject({
      ok: false,
    });
    expect(parseWeeklyWindowForm(form({ ...base, end_time: "05:00" }))).toMatchObject({
      ok: false,
      message: "The start and end can't be the same time.",
    });
    expect(parseWeeklyWindowForm(form({ ...base, effective_to: "2026-10-04" }))).toMatchObject({
      ok: false,
      message: "The end date is before the start date.",
    });
  });
});

describe("parseChangeForm", () => {
  const modes = ["closed", "open"] as const;

  it("turns station-local dates and times into instants", () => {
    const parsed = parseChangeForm(
      form({
        mode: "open",
        from_date: "2026-10-20",
        from_time: "09:00",
        until_date: "2026-10-20",
        until_time: "11:00",
        reason: "",
      }),
      modes,
      "Choose closed or open.",
    );
    expect(parsed).toEqual({
      ok: true,
      fields: {
        starts_at: "2026-10-20T14:00:00.000Z",
        ends_at: "2026-10-20T16:00:00.000Z",
        mode: "open",
        reason: null,
      },
    });
  });

  it("defaults a missing time to midnight and refuses a change that ends first", () => {
    const whole = parseChangeForm(
      form({ mode: "closed", from_date: "2026-10-05", until_date: "2026-10-12" }),
      modes,
      "Choose closed or open.",
    );
    expect(whole).toMatchObject({
      ok: true,
      fields: { starts_at: "2026-10-05T05:00:00.000Z", ends_at: "2026-10-12T05:00:00.000Z" },
    });
    expect(
      parseChangeForm(
        form({ mode: "closed", from_date: "2026-10-12", until_date: "2026-10-05" }),
        modes,
        "Choose closed or open.",
      ),
    ).toEqual({ ok: false, message: "The change has to end after it starts." });
  });

  it("refuses a mode the screen doesn't offer, with the screen's own words", () => {
    expect(
      parseChangeForm(
        form({ mode: "automated", from_date: "2026-10-05", until_date: "2026-10-06" }),
        modes,
        "Choose closed or open.",
      ),
    ).toEqual({ ok: false, message: "Choose closed or open." });
  });
});

describe("overlapMessage", () => {
  it("names the exclusion constraint's refusal and nothing else", () => {
    expect(overlapMessage("23P01")).toMatch(/already covers/);
    expect(overlapMessage("23505")).toBeNull();
    expect(overlapMessage(undefined)).toBeNull();
  });
});

describe("hoursPagePath", () => {
  it("returns the bare path with no view or date", () => {
    expect(hoursPagePath("/log/x", form({}))).toBe("/log/x");
  });

  it("keeps a month view and a real date, and appends extras", () => {
    expect(
      hoursPagePath("/log/x", form({ view: "month", date: "2026-10-09" }), { new: "weekly" }),
    ).toBe("/log/x?view=month&date=2026-10-09&new=weekly");
  });

  it("drops an impossible date and any other view", () => {
    expect(hoursPagePath("/log/x", form({ view: "week", date: "2026-02-30" }))).toBe("/log/x");
  });
});
