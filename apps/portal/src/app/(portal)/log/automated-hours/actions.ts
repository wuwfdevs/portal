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
import type { LogOnAirMode } from "@/lib/database.types";

/**
 * Program-director-only writes for automated hours (20261002130000).
 * Nothing is ever deleted: removing a window or change sets
 * `active = false`, which also frees its time for the one-time changes'
 * no-overlap rule. Every write is audited as `log.automated_hours.*`. The
 * form parsing is shared with the Underwriting hours screen
 * (lib/log/hour-window-form.ts).
 */

const BASE_PATH = "/log/automated-hours";
const MODES: readonly LogOnAirMode[] = ["automated", "live"];

function pathFrom(formData: FormData, extra: Record<string, string> = {}): string {
  return hoursPagePath(BASE_PATH, formData, extra);
}

function done(formData: FormData): never {
  revalidatePath(BASE_PATH);
  revalidatePath("/log/programs");
  revalidatePath("/log/underwriting-hours");
  redirect(pathFrom(formData));
}

export async function createWeeklyWindow(formData: FormData): Promise<void> {
  const { profile } = await assertProgramDirector();
  const errorPath = pathFrom(formData, { new: "weekly" });
  const parsed = parseWeeklyWindowForm(formData);
  if (!parsed.ok) failWith(errorPath, parsed.message);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("log_automated_weekly")
    .insert({ ...parsed.fields, created_by: profile.id })
    .select("id")
    .single();
  failIfError(error, errorPath, "Could not add these hours");
  await logAuditEvent({
    actorId: profile.id,
    action: "log.automated_hours.weekly_added",
    targetType: "log_automated_weekly",
    targetId: data?.id,
    metadata: { ...parsed.fields },
  });
  done(formData);
}

export async function updateWeeklyWindow(formData: FormData): Promise<void> {
  const { profile } = await assertProgramDirector();
  const id = field(formData, "id");
  const errorPath = pathFrom(formData, { edit: id });
  const parsed = parseWeeklyWindowForm(formData);
  if (!parsed.ok) failWith(errorPath, parsed.message);
  const supabase = await createClient();
  const { error } = await supabase.from("log_automated_weekly").update(parsed.fields).eq("id", id);
  failIfError(error, errorPath, "Could not save these hours");
  await logAuditEvent({
    actorId: profile.id,
    action: "log.automated_hours.weekly_updated",
    targetType: "log_automated_weekly",
    targetId: id,
    metadata: { ...parsed.fields },
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

export async function createOnAirChange(formData: FormData): Promise<void> {
  const { profile } = await assertProgramDirector();
  const errorPath = pathFrom(formData, { new: "once" });
  const parsed = parseChangeForm(formData, MODES, "Choose automated or live.");
  if (!parsed.ok) failWith(errorPath, parsed.message);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("log_on_air_changes")
    .insert({ ...parsed.fields, created_by: profile.id })
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
    metadata: { ...parsed.fields },
  });
  done(formData);
}

export async function updateOnAirChange(formData: FormData): Promise<void> {
  const { profile } = await assertProgramDirector();
  const id = field(formData, "id");
  const errorPath = pathFrom(formData, { edit: id });
  const parsed = parseChangeForm(formData, MODES, "Choose automated or live.");
  if (!parsed.ok) failWith(errorPath, parsed.message);
  const supabase = await createClient();
  const { error } = await supabase.from("log_on_air_changes").update(parsed.fields).eq("id", id);
  const overlap = overlapMessage(error?.code);
  if (overlap) failWith(errorPath, overlap);
  failIfError(error, errorPath, "Could not save the change");
  await logAuditEvent({
    actorId: profile.id,
    action: "log.automated_hours.change_updated",
    targetType: "log_on_air_changes",
    targetId: id,
    metadata: { ...parsed.fields },
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
