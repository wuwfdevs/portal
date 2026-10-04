"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertProgramDirector } from "@/lib/log/access";
import { logAuditEvent } from "@/lib/audit";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { stationLocalToUTC } from "@/lib/log/automated-hours";
import { isValidDateISO } from "@/lib/log/week-layout";
import type { LogOnAirMode } from "@/lib/database.types";

/**
 * Producer-only writes for automated hours (20261002130000). Nothing is
 * ever deleted: removing a window or change sets `active = false`, which
 * also frees its time for the one-time changes' no-overlap rule. Every
 * write is audited as `log.automated_hours.*`.
 */

const BASE_PATH = "/log/automated-hours";
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/** Where to land: the page with its view and date kept, plus any card to reopen on error. */
function pathFrom(formData: FormData, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  const view = field(formData, "view");
  if (view === "month") params.set("view", "month");
  const date = field(formData, "date");
  if (isValidDateISO(date)) params.set("date", date);
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const query = params.toString();
  return query ? `${BASE_PATH}?${query}` : BASE_PATH;
}

function done(formData: FormData): never {
  revalidatePath(BASE_PATH);
  redirect(pathFrom(formData));
}

interface WeeklyFields {
  days_of_week: number[];
  start_time: string;
  end_time: string;
  effective_from: string;
  effective_to: string | null;
  reason: string | null;
}

function parseWeekly(formData: FormData, errorPath: string): WeeklyFields {
  const days = [
    ...new Set(
      formData
        .getAll("day")
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
    ),
  ].sort();
  if (days.length === 0) failWith(errorPath, "Pick at least one day.");
  const start = field(formData, "start_time");
  const end = field(formData, "end_time");
  if (!TIME_PATTERN.test(start) || !TIME_PATTERN.test(end)) {
    failWith(errorPath, "Enter a start and end time.");
  }
  if (start === end) failWith(errorPath, "The start and end can't be the same time.");
  const from = field(formData, "effective_from");
  if (!isValidDateISO(from)) failWith(errorPath, "Enter the date these hours start.");
  const to = field(formData, "effective_to");
  if (to !== "" && !isValidDateISO(to)) failWith(errorPath, "That end date isn't a date.");
  if (to !== "" && to < from) failWith(errorPath, "The end date is before the start date.");
  const reason = field(formData, "reason");
  return {
    days_of_week: days,
    start_time: `${start}:00`,
    end_time: `${end}:00`,
    effective_from: from,
    effective_to: to === "" ? null : to,
    reason: reason === "" ? null : reason.slice(0, 200),
  };
}

export async function createWeeklyWindow(formData: FormData): Promise<void> {
  const { profile } = await assertProgramDirector();
  const errorPath = pathFrom(formData, { new: "weekly" });
  const fields = parseWeekly(formData, errorPath);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("log_automated_weekly")
    .insert({ ...fields, created_by: profile.id })
    .select("id")
    .single();
  failIfError(error, errorPath, "Could not add these hours");
  await logAuditEvent({
    actorId: profile.id,
    action: "log.automated_hours.weekly_added",
    targetType: "log_automated_weekly",
    targetId: data?.id,
    metadata: { ...fields },
  });
  done(formData);
}

export async function updateWeeklyWindow(formData: FormData): Promise<void> {
  const { profile } = await assertProgramDirector();
  const id = field(formData, "id");
  const errorPath = pathFrom(formData, { edit: id });
  const fields = parseWeekly(formData, errorPath);
  const supabase = await createClient();
  const { error } = await supabase.from("log_automated_weekly").update(fields).eq("id", id);
  failIfError(error, errorPath, "Could not save these hours");
  await logAuditEvent({
    actorId: profile.id,
    action: "log.automated_hours.weekly_updated",
    targetType: "log_automated_weekly",
    targetId: id,
    metadata: { ...fields },
  });
  done(formData);
}

export async function removeWeeklyWindow(formData: FormData): Promise<void> {
  const { profile } = await assertProgramDirector();
  const id = field(formData, "id");
  const supabase = await createClient();
  const { error } = await supabase
    .from("log_automated_weekly")
    .update({ active: false })
    .eq("id", id);
  failIfError(error, pathFrom(formData), "Could not remove these hours");
  await logAuditEvent({
    actorId: profile.id,
    action: "log.automated_hours.weekly_removed",
    targetType: "log_automated_weekly",
    targetId: id,
  });
  done(formData);
}

const MODES: LogOnAirMode[] = ["automated", "live"];

interface ChangeFields {
  starts_at: string;
  ends_at: string;
  mode: LogOnAirMode;
  reason: string | null;
}

function parseChange(formData: FormData, errorPath: string): ChangeFields {
  const mode = field(formData, "mode") as LogOnAirMode;
  if (!MODES.includes(mode)) failWith(errorPath, "Choose automated or live.");
  const fromDate = field(formData, "from_date");
  const untilDate = field(formData, "until_date");
  const fromTime = field(formData, "from_time") || "00:00";
  const untilTime = field(formData, "until_time") || "00:00";
  if (!isValidDateISO(fromDate) || !isValidDateISO(untilDate)) {
    failWith(errorPath, "Enter when the change starts and ends.");
  }
  if (!TIME_PATTERN.test(fromTime) || !TIME_PATTERN.test(untilTime)) {
    failWith(errorPath, "Enter times as hours and minutes.");
  }
  const startsAt = stationLocalToUTC(fromDate, `${fromTime}:00`);
  const endsAt = stationLocalToUTC(untilDate, `${untilTime}:00`);
  if (Date.parse(endsAt) <= Date.parse(startsAt)) {
    failWith(errorPath, "The change has to end after it starts.");
  }
  const reason = field(formData, "reason");
  return {
    starts_at: startsAt,
    ends_at: endsAt,
    mode,
    reason: reason === "" ? null : reason.slice(0, 200),
  };
}

/** The exclusion constraint's refusal, said plainly. */
function overlapMessage(code: string | undefined): string | null {
  return code === "23P01"
    ? "Another one-time change already covers part of that time. Edit or remove it first."
    : null;
}

export async function createOnAirChange(formData: FormData): Promise<void> {
  const { profile } = await assertProgramDirector();
  const errorPath = pathFrom(formData, { new: "once" });
  const fields = parseChange(formData, errorPath);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("log_on_air_changes")
    .insert({ ...fields, created_by: profile.id })
    .select("id")
    .single();
  const overlap = overlapMessage(error?.code);
  if (overlap) failWith(errorPath, overlap);
  failIfError(error, errorPath, "Could not add the change");
  await logAuditEvent({
    actorId: profile.id,
    action: "log.automated_hours.change_added",
    targetType: "log_on_air_changes",
    targetId: data?.id,
    metadata: { ...fields },
  });
  done(formData);
}

export async function updateOnAirChange(formData: FormData): Promise<void> {
  const { profile } = await assertProgramDirector();
  const id = field(formData, "id");
  const errorPath = pathFrom(formData, { edit: id });
  const fields = parseChange(formData, errorPath);
  const supabase = await createClient();
  const { error } = await supabase.from("log_on_air_changes").update(fields).eq("id", id);
  const overlap = overlapMessage(error?.code);
  if (overlap) failWith(errorPath, overlap);
  failIfError(error, errorPath, "Could not save the change");
  await logAuditEvent({
    actorId: profile.id,
    action: "log.automated_hours.change_updated",
    targetType: "log_on_air_changes",
    targetId: id,
    metadata: { ...fields },
  });
  done(formData);
}

export async function removeOnAirChange(formData: FormData): Promise<void> {
  const { profile } = await assertProgramDirector();
  const id = field(formData, "id");
  const supabase = await createClient();
  const { error } = await supabase
    .from("log_on_air_changes")
    .update({ active: false })
    .eq("id", id);
  failIfError(error, pathFrom(formData), "Could not remove the change");
  await logAuditEvent({
    actorId: profile.id,
    action: "log.automated_hours.change_removed",
    targetType: "log_on_air_changes",
    targetId: id,
  });
  done(formData);
}
