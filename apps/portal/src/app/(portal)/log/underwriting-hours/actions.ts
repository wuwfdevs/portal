"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { field } from "@/lib/form-fields";
import { assertProgramDirector } from "@/lib/log/access";
import { logAuditEvent } from "@/lib/audit";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import {
  hoursPagePath,
  overlapMessage,
  parseChangeForm,
  parseWeeklyWindowForm,
} from "@/lib/log/hour-window-form";
import type { LogUnderwritingHoursMode } from "@/lib/database.types";

/**
 * Program-director-only writes for the hours closed to underwriting
 * (20261005130000) — the same shape as automated hours' actions, over the
 * other pair of tables. Nothing is ever deleted: removing a window or
 * change sets `active = false`, which also frees its time for the one-time
 * changes' no-overlap rule. Every write is audited as
 * `log.underwriting_hours.*`. Traffic's auto-fill reads the result on its
 * next run; nothing already placed is moved.
 */

const BASE_PATH = "/log/underwriting-hours";
const MODES: readonly LogUnderwritingHoursMode[] = ["closed", "open"];

function pathFrom(formData: FormData, extra: Record<string, string> = {}): string {
  return hoursPagePath(BASE_PATH, formData, extra);
}

function done(formData: FormData): never {
  revalidatePath(BASE_PATH);
  revalidatePath("/log/programs");
  revalidatePath("/log/automated-hours");
  revalidatePath("/underwriting");
  redirect(pathFrom(formData));
}

export async function createClosedWindow(formData: FormData): Promise<void> {
  const { profile } = await assertProgramDirector();
  const errorPath = pathFrom(formData, { new: "weekly" });
  const parsed = parseWeeklyWindowForm(formData);
  if (!parsed.ok) failWith(errorPath, parsed.message);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("log_underwriting_closed_weekly")
    .insert({ ...parsed.fields, created_by: profile.id })
    .select("id")
    .single();
  failIfError(error, errorPath, "Could not add these hours");
  await logAuditEvent({
    actorId: profile.id,
    action: "log.underwriting_hours.weekly_added",
    targetType: "log_underwriting_closed_weekly",
    targetId: data?.id,
    metadata: { ...parsed.fields },
  });
  done(formData);
}

export async function updateClosedWindow(formData: FormData): Promise<void> {
  const { profile } = await assertProgramDirector();
  const id = field(formData, "id");
  const errorPath = pathFrom(formData, { edit: id });
  const parsed = parseWeeklyWindowForm(formData);
  if (!parsed.ok) failWith(errorPath, parsed.message);
  const supabase = await createClient();
  const { error } = await supabase
    .from("log_underwriting_closed_weekly")
    .update(parsed.fields)
    .eq("id", id);
  failIfError(error, errorPath, "Could not save these hours");
  await logAuditEvent({
    actorId: profile.id,
    action: "log.underwriting_hours.weekly_updated",
    targetType: "log_underwriting_closed_weekly",
    targetId: id,
    metadata: { ...parsed.fields },
  });
  done(formData);
}

export async function removeClosedWindow(formData: FormData): Promise<void> {
  const { profile } = await assertProgramDirector();
  const id = field(formData, "id");
  const supabase = await createClient();
  const { error } = await supabase
    .from("log_underwriting_closed_weekly")
    .update({ active: false })
    .eq("id", id);
  failIfError(error, pathFrom(formData), "Could not remove these hours");
  await logAuditEvent({
    actorId: profile.id,
    action: "log.underwriting_hours.weekly_removed",
    targetType: "log_underwriting_closed_weekly",
    targetId: id,
  });
  done(formData);
}

export async function createUnderwritingHourChange(formData: FormData): Promise<void> {
  const { profile } = await assertProgramDirector();
  const errorPath = pathFrom(formData, { new: "once" });
  const parsed = parseChangeForm(formData, MODES, "Choose closed or open.");
  if (!parsed.ok) failWith(errorPath, parsed.message);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("log_underwriting_hour_changes")
    .insert({ ...parsed.fields, created_by: profile.id })
    .select("id")
    .single();
  const overlap = overlapMessage(error?.code);
  if (overlap) failWith(errorPath, overlap);
  failIfError(error, errorPath, "Could not add the change");
  await logAuditEvent({
    actorId: profile.id,
    action: "log.underwriting_hours.change_added",
    targetType: "log_underwriting_hour_changes",
    targetId: data?.id,
    metadata: { ...parsed.fields },
  });
  done(formData);
}

export async function updateUnderwritingHourChange(formData: FormData): Promise<void> {
  const { profile } = await assertProgramDirector();
  const id = field(formData, "id");
  const errorPath = pathFrom(formData, { edit: id });
  const parsed = parseChangeForm(formData, MODES, "Choose closed or open.");
  if (!parsed.ok) failWith(errorPath, parsed.message);
  const supabase = await createClient();
  const { error } = await supabase
    .from("log_underwriting_hour_changes")
    .update(parsed.fields)
    .eq("id", id);
  const overlap = overlapMessage(error?.code);
  if (overlap) failWith(errorPath, overlap);
  failIfError(error, errorPath, "Could not save the change");
  await logAuditEvent({
    actorId: profile.id,
    action: "log.underwriting_hours.change_updated",
    targetType: "log_underwriting_hour_changes",
    targetId: id,
    metadata: { ...parsed.fields },
  });
  done(formData);
}

export async function removeUnderwritingHourChange(formData: FormData): Promise<void> {
  const { profile } = await assertProgramDirector();
  const id = field(formData, "id");
  const supabase = await createClient();
  const { error } = await supabase
    .from("log_underwriting_hour_changes")
    .update({ active: false })
    .eq("id", id);
  failIfError(error, pathFrom(formData), "Could not remove the change");
  await logAuditEvent({
    actorId: profile.id,
    action: "log.underwriting_hours.change_removed",
    targetType: "log_underwriting_hour_changes",
    targetId: id,
  });
  done(formData);
}
