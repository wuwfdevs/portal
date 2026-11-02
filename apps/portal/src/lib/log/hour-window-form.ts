// Form parsing shared by the Automated hours and Underwriting hours screens
// (lib/log/automated-hours.ts, lib/log/underwriting-hours.ts): both record
// weekly windows and one-time changes with the same fields, so both actions
// files read them here. Pure — a problem is reported as a message for the
// caller to failWith(), never thrown. Tested in hour-window-form.test.ts.

import { field } from "@/lib/form-fields";
import { isValidDateISO } from "@/lib/dates";
import { stationLocalToUTC } from "./automated-hours";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const REASON_MAX = 200;

export interface WeeklyWindowFields {
  days_of_week: number[];
  start_time: string;
  end_time: string;
  effective_from: string;
  effective_to: string | null;
  reason: string | null;
}

export interface ChangeFields<Mode extends string> {
  starts_at: string;
  ends_at: string;
  mode: Mode;
  reason: string | null;
}

export type ParsedForm<T> = { ok: true; fields: T } | { ok: false; message: string };

function reasonFrom(formData: FormData): string | null {
  const reason = field(formData, "reason");
  return reason === "" ? null : reason.slice(0, REASON_MAX);
}

/** The weekly-window card's fields: days (0 = Sunday), HH:MM times, effective dates, an optional note. */
export function parseWeeklyWindowForm(formData: FormData): ParsedForm<WeeklyWindowFields> {
  const days = [
    ...new Set(
      formData
        .getAll("day")
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
    ),
  ].sort();
  if (days.length === 0) return { ok: false, message: "Pick at least one day." };
  const start = field(formData, "start_time");
  const end = field(formData, "end_time");
  if (!TIME_PATTERN.test(start) || !TIME_PATTERN.test(end)) {
    return { ok: false, message: "Enter a start and end time." };
  }
  if (start === end) return { ok: false, message: "The start and end can't be the same time." };
  const from = field(formData, "effective_from");
  if (!isValidDateISO(from)) return { ok: false, message: "Enter the date these hours start." };
  const to = field(formData, "effective_to");
  if (to !== "" && !isValidDateISO(to))
    return { ok: false, message: "That end date isn't a date." };
  if (to !== "" && to < from)
    return { ok: false, message: "The end date is before the start date." };
  return {
    ok: true,
    fields: {
      days_of_week: days,
      start_time: `${start}:00`,
      end_time: `${end}:00`,
      effective_from: from,
      effective_to: to === "" ? null : to,
      reason: reasonFrom(formData),
    },
  };
}

/**
 * The one-time-change card's fields: a mode from `modes` (the screen's two
 * choices), station-local from/until dates and times as UTC instants, an
 * optional reason. A missing time means midnight.
 */
export function parseChangeForm<Mode extends string>(
  formData: FormData,
  modes: readonly Mode[],
  modeMessage: string,
): ParsedForm<ChangeFields<Mode>> {
  const mode = field(formData, "mode") as Mode;
  if (!modes.includes(mode)) return { ok: false, message: modeMessage };
  const fromDate = field(formData, "from_date");
  const untilDate = field(formData, "until_date");
  const fromTime = field(formData, "from_time") || "00:00";
  const untilTime = field(formData, "until_time") || "00:00";
  if (!isValidDateISO(fromDate) || !isValidDateISO(untilDate)) {
    return { ok: false, message: "Enter when the change starts and ends." };
  }
  if (!TIME_PATTERN.test(fromTime) || !TIME_PATTERN.test(untilTime)) {
    return { ok: false, message: "Enter times as hours and minutes." };
  }
  const startsAt = stationLocalToUTC(fromDate, `${fromTime}:00`);
  const endsAt = stationLocalToUTC(untilDate, `${untilTime}:00`);
  if (Date.parse(endsAt) <= Date.parse(startsAt)) {
    return { ok: false, message: "The change has to end after it starts." };
  }
  return {
    ok: true,
    fields: { starts_at: startsAt, ends_at: endsAt, mode, reason: reasonFrom(formData) },
  };
}

/** The exclusion constraint's refusal (Postgres 23P01), said plainly. */
export function overlapMessage(code: string | undefined): string | null {
  return code === "23P01"
    ? "Another one-time change already covers part of that time. Edit or remove it first."
    : null;
}

/**
 * Where an Automated hours / Underwriting hours action lands: the page at
 * `basePath` with its view and date kept, plus any card to reopen on error.
 */
export function hoursPagePath(
  basePath: string,
  formData: FormData,
  extra: Record<string, string> = {},
): string {
  const params = new URLSearchParams();
  if (field(formData, "view") === "month") params.set("view", "month");
  const date = field(formData, "date");
  if (isValidDateISO(date)) params.set("date", date);
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
