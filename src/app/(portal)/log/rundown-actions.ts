"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertLogAccess } from "@/lib/log/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { computeTotalDurationSeconds } from "@/lib/log/content-library";
import { resolveCurrentVersion } from "@/lib/log/clock-versions";
import { buildRundownItemDrafts } from "@/lib/log/rundown-generation";
import { stationLocalDateTimeToUTC } from "@/lib/log/timezone";
import {
  getClockTemplateDetail,
  getContentItemDetail,
  getRundownForProgramOnDate,
  getScheduleEntry,
} from "@/lib/log/queries";

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function rundownPath(id: string): string {
  return `/log/rundowns/${id}`;
}

/**
 * Generates (or, if one already exists, just links to) the rundown for a
 * schedule entry's program on a given air date — docs/log-design.md
 * Workflow E. Idempotent: log_rundowns' unique (program_id, air_date)
 * constraint backs this up at the database level too.
 */
export async function generateRundown(formData: FormData): Promise<void> {
  await assertLogAccess();
  const scheduleEntryId = field(formData, "schedule_entry_id");
  const airDate = field(formData, "air_date");
  if (scheduleEntryId === "" || airDate === "") failWith("/log", "Choose a program to generate a rundown for.");

  const scheduleEntry = await getScheduleEntry(scheduleEntryId);
  if (!scheduleEntry) failWith("/log", "That schedule entry no longer exists.");

  const existing = await getRundownForProgramOnDate(scheduleEntry.program_id, airDate);
  if (existing) redirect(rundownPath(existing.id));

  const template = await getClockTemplateDetail(scheduleEntry.clock_template_id);
  const version = template ? resolveCurrentVersion(template.versions, airDate) : null;
  if (!version) failWith("/log", "This program's clock has no version in effect on that date.");

  const shiftStartAt = stationLocalDateTimeToUTC(airDate, scheduleEntry.air_time);
  const shiftEndAt = new Date(
    new Date(shiftStartAt).getTime() + scheduleEntry.duration_minutes * 60_000,
  ).toISOString();

  const supabase = await createClient();
  const { data: rundown, error: rundownError } = await supabase
    .from("log_rundowns")
    .insert({
      program_id: scheduleEntry.program_id,
      schedule_entry_id: scheduleEntry.id,
      clock_version_id: version.id,
      air_date: airDate,
      shift_start_at: shiftStartAt,
      shift_end_at: shiftEndAt,
      status: "generated",
      generated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  failIfError(rundownError, "/log", "Could not generate the rundown");
  if (!rundown) failWith("/log", "Could not generate the rundown.");

  const drafts = buildRundownItemDrafts(version.slots, shiftStartAt, scheduleEntry.duration_minutes);
  if (drafts.length > 0) {
    const { error: itemsError } = await supabase.from("log_rundown_items").insert(
      drafts.map((draft) => ({
        rundown_id: rundown.id,
        clock_slot_id: draft.clock_slot_id,
        position: draft.position,
        scheduled_at: draft.scheduled_at,
        planned_duration_seconds: draft.planned_duration_seconds,
        requirement_level: draft.requirement_level,
      })),
    );
    failIfError(itemsError, "/log", "Rundown created, but its items could not be generated");
  }

  revalidatePath("/log");
  redirect(rundownPath(rundown.id));
}

/** Fills (or replaces) a rundown item's content, recomputing its planned duration from the chosen item's components. */
export async function fillRundownItem(formData: FormData): Promise<void> {
  await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  const itemId = field(formData, "item_id");
  const contentItemId = field(formData, "content_item_id");
  const path = rundownPath(rundownId);
  if (contentItemId === "") failWith(path, "Choose a content item.");

  const contentItem = await getContentItemDetail(contentItemId);
  if (!contentItem) failWith(path, "That content item no longer exists.");
  const plannedDuration =
    computeTotalDurationSeconds(contentItem.components, contentItem.expected_duration_seconds) ?? 0;

  const supabase = await createClient();
  const { error } = await supabase
    .from("log_rundown_items")
    .update({
      content_item_id: contentItemId,
      planned_duration_seconds: plannedDuration,
      placement_status: "replaceable",
    })
    .eq("id", itemId);
  failIfError(error, path, "Could not fill this slot");

  revalidatePath(path);
  redirect(path);
}

/** Empties a rundown item back to its slot's nominal duration. */
export async function clearRundownItem(formData: FormData): Promise<void> {
  await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  const itemId = field(formData, "item_id");
  const slotDurationSeconds = Number.parseInt(field(formData, "slot_duration_seconds"), 10);
  const path = rundownPath(rundownId);

  const supabase = await createClient();
  const { error } = await supabase
    .from("log_rundown_items")
    .update({
      content_item_id: null,
      planned_duration_seconds: Number.isFinite(slotDurationSeconds) ? slotDurationSeconds : 1,
      placement_status: "editable",
    })
    .eq("id", itemId);
  failIfError(error, path, "Could not clear this slot");

  revalidatePath(path);
  redirect(path);
}
