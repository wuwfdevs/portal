"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertLogAccess } from "@/lib/log/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { resolveCurrentVersion } from "@/lib/log/clock-versions";
import { buildRundownBreakDrafts } from "@/lib/log/rundown-generation";
import { computeEffectiveDurationSeconds } from "@/lib/log/content-library";
import { stationLocalDateTimeToUTC } from "@/lib/log/timezone";
import { invokeCapability } from "@/lib/capabilities/registry";
import { buildRundownItem } from "@/lib/log/capabilities";
import {
  getClockTemplateDetail,
  getContentItemDetail,
  getRundownForProgramOnDate,
  getScheduleEntry,
  listLocalOpportunitiesForVersion,
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
 * constraint backs this up at the database level too. Every local
 * opportunity gets a break (including optional ones, which render as
 * "carrying network" until something is placed) — see
 * lib/log/rundown-generation.ts.
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

  const opportunities = await listLocalOpportunitiesForVersion(version.id);

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

  const drafts = buildRundownBreakDrafts(opportunities, shiftStartAt, scheduleEntry.duration_minutes);
  if (drafts.length > 0) {
    const { error: breaksError } = await supabase.from("log_rundown_breaks").insert(
      drafts.map((draft) => ({
        rundown_id: rundown.id,
        local_opportunity_id: draft.local_opportunity_id,
        position: draft.position,
        label: draft.label,
        requirement: draft.requirement,
        permitted_content_types: draft.permitted_content_types,
        allow_multiple: draft.allow_multiple,
        scheduled_at: draft.scheduled_at,
        available_duration_seconds: draft.available_duration_seconds,
        network_rejoin_at: draft.network_rejoin_at,
      })),
    );
    failIfError(breaksError, "/log", "Rundown created, but its local-opportunity breaks could not be generated");
  }

  revalidatePath("/log");
  redirect(rundownPath(rundown.id));
}

/** Thin adapter over log.rundown.buildItem: parse FormData, invoke the capability, map the result to failWith()/redirect(). */
export async function fillRundownItem(formData: FormData): Promise<void> {
  await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  const breakId = field(formData, "break_id");
  const contentItemId = field(formData, "content_item_id");
  const path = rundownPath(rundownId);
  if (contentItemId === "") failWith(path, "Choose a content item.");

  const result = await invokeCapability(buildRundownItem, { breakId, contentItemId });
  if (!result.ok) failWith(path, result.message);

  revalidatePath(path);
  redirect(path);
}

/** Creates a one-off, ad-hoc item with no library content_item — "create a new one-time item without leaving the rundown" (docs/log-design.md Workflow E). */
export async function createLiveReadItem(formData: FormData): Promise<void> {
  await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  const breakId = field(formData, "break_id");
  const title = field(formData, "title");
  const script = field(formData, "script");
  const durationSeconds = Number.parseInt(field(formData, "duration_seconds"), 10);
  const path = rundownPath(rundownId);
  if (title === "") failWith(path, "Give this live-read item a short title.");
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) failWith(path, "Enter a duration in seconds.");

  const supabase = await createClient();
  const { data: existingItems, error: countError } = await supabase
    .from("log_rundown_items")
    .select("position")
    .eq("break_id", breakId);
  failIfError(countError, path, "Could not add this item");
  const nextPosition = Math.max(0, ...(existingItems ?? []).map((item) => item.position)) + 1;

  const { error } = await supabase.from("log_rundown_items").insert({
    break_id: breakId,
    position: nextPosition,
    item_kind: "live_read",
    live_read_title: title,
    live_read_script: script || null,
    planned_duration_seconds: durationSeconds,
    placement_status: "editable",
  });
  failIfError(error, path, "Could not add this item");

  revalidatePath(path);
  redirect(path);
}

/** Places the current weather reading into a break that permits it — the effective text is always today's live reading unless overridden for this one airing. */
export async function addWeatherItem(formData: FormData): Promise<void> {
  await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  const breakId = field(formData, "break_id");
  const durationSeconds = Number.parseInt(field(formData, "duration_seconds"), 10) || 20;
  const path = rundownPath(rundownId);

  const supabase = await createClient();
  const { data: existingItems, error: countError } = await supabase
    .from("log_rundown_items")
    .select("position")
    .eq("break_id", breakId);
  failIfError(countError, path, "Could not add weather");
  const nextPosition = Math.max(0, ...(existingItems ?? []).map((item) => item.position)) + 1;

  const { error } = await supabase.from("log_rundown_items").insert({
    break_id: breakId,
    position: nextPosition,
    item_kind: "weather",
    planned_duration_seconds: durationSeconds,
    placement_status: "editable",
  });
  failIfError(error, path, "Could not add weather");

  revalidatePath(path);
  redirect(path);
}

/**
 * Removes a placed item from its break entirely — an ordinary delete now
 * that a break can hold several items, not "clear back to empty" (there is
 * no empty placeholder row anymore). Scoped to content/live_read/weather —
 * an underwriting-credit item is only ever removed through
 * log_clear_underwriting_credit() (see the Underwriting placement screen).
 */
export async function removeRundownItem(formData: FormData): Promise<void> {
  await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  const itemId = field(formData, "item_id");
  const path = rundownPath(rundownId);

  const supabase = await createClient();
  const { error } = await supabase
    .from("log_rundown_items")
    .delete()
    .eq("id", itemId)
    .neq("item_kind", "underwriting_credit");
  failIfError(error, path, "Could not remove this item");

  revalidatePath(path);
  redirect(path);
}

/**
 * Per-airing overrides (docs/log-design.md's "durable content vs.
 * per-airing overrides") — never written back to the master log_content_item
 * or its components. Recomputes planned_duration_seconds from the master
 * components plus whichever overrides were given.
 */
export async function updateItemOverrides(formData: FormData): Promise<void> {
  await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  const itemId = field(formData, "item_id");
  const path = rundownPath(rundownId);

  const parseOptionalInt = (name: string): number | null => {
    const raw = field(formData, name);
    if (raw === "") return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const overrideScript = field(formData, "override_script");
  const overrideNotes = field(formData, "override_notes");
  const overrideDurationSeconds = parseOptionalInt("override_duration_seconds");
  const overrideLiveIntroSeconds = parseOptionalInt("override_live_intro_seconds");
  const overrideLiveOutroSeconds = parseOptionalInt("override_live_outro_seconds");
  const overrideTagSeconds = parseOptionalInt("override_tag_seconds");

  const supabase = await createClient();
  const { data: item, error: itemError } = await supabase
    .from("log_rundown_items")
    .select("content_item_id")
    .eq("id", itemId)
    .single();
  failIfError(itemError, path, "Could not update this item");

  let plannedDurationSeconds: number | null = overrideDurationSeconds;
  if (plannedDurationSeconds === null && item?.content_item_id) {
    const contentItem = await getContentItemDetail(item.content_item_id);
    plannedDurationSeconds = contentItem
      ? computeEffectiveDurationSeconds(contentItem.components, contentItem.expected_duration_seconds, {
          override_live_intro_seconds: overrideLiveIntroSeconds,
          override_live_outro_seconds: overrideLiveOutroSeconds,
          override_tag_seconds: overrideTagSeconds,
        })
      : null;
  }

  const { error } = await supabase
    .from("log_rundown_items")
    .update({
      override_script: overrideScript || null,
      override_notes: overrideNotes || null,
      override_duration_seconds: overrideDurationSeconds,
      override_live_intro_seconds: overrideLiveIntroSeconds,
      override_live_outro_seconds: overrideLiveOutroSeconds,
      override_tag_seconds: overrideTagSeconds,
      ...(plannedDurationSeconds !== null ? { planned_duration_seconds: plannedDurationSeconds } : {}),
    })
    .eq("id", itemId);
  failIfError(error, path, "Could not update this item");

  revalidatePath(path);
  redirect(path);
}
