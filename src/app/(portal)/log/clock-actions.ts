"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertLogProducer } from "@/lib/log/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { PERMITTED_CONTENT_TYPE_OPTIONS } from "@/lib/log/content-library";
import type { LogClockVersionVariant, LogOpportunityRequirement, LogSlotTimingMode } from "@/lib/database.types";

const LIST_PATH = "/log/clocks";

function templatePath(id: string): string {
  return `${LIST_PATH}/${id}`;
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function optionalField(formData: FormData, name: string): string | null {
  const value = field(formData, name);
  return value === "" ? null : value;
}

export async function createClockTemplate(formData: FormData): Promise<void> {
  const { profile } = await assertLogProducer();
  const name = field(formData, "name");
  if (name === "") failWith(LIST_PATH, "Give the clock template a name.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("log_clock_templates")
    .insert({
      name,
      description: optionalField(formData, "description"),
      created_by: profile.id,
    })
    .select("id")
    .single();
  failIfError(error, LIST_PATH, "Could not create the clock template");
  if (!data) failWith(LIST_PATH, "Could not create the clock template.");

  revalidatePath(LIST_PATH);
  redirect(templatePath(data.id));
}

const VARIANTS: LogClockVersionVariant[] = [
  "weekday",
  "weekend",
  "program_specific",
  "holiday",
  "special_event",
];

/**
 * Starts a new version of a clock template. Versions are insert-only (see
 * the migration's file header) — there is no edit-in-place, only a new
 * version superseding the old one for its variant from effective_from on.
 */
export async function createClockVersion(formData: FormData): Promise<void> {
  await assertLogProducer();
  const templateId = field(formData, "clock_template_id");
  const path = templatePath(templateId);
  const variant = field(formData, "variant") as LogClockVersionVariant;
  if (!VARIANTS.includes(variant)) failWith(path, "That is not a recognized clock variant.");
  const effectiveFrom = field(formData, "effective_from");
  if (effectiveFrom === "") failWith(path, "Give the version an effective date.");

  const supabase = await createClient();
  const { error } = await supabase.from("log_clock_versions").insert({
    clock_template_id: templateId,
    variant,
    effective_from: effectiveFrom,
    effective_to: optionalField(formData, "effective_to"),
  });
  failIfError(error, path, "Could not create the clock version");

  revalidatePath(path);
  redirect(path);
}

const TIMING_MODES: LogSlotTimingMode[] = ["fixed", "float"];

/**
 * Appends one network clock slot to a clock version — the network's own
 * structure only (offset, duration, label). Insert-only, same reasoning as
 * the version itself. Local fillability is a separate concept — see
 * addLocalOpportunity below.
 */
export async function addClockSlot(formData: FormData): Promise<void> {
  await assertLogProducer();
  const templateId = field(formData, "clock_template_id");
  const versionId = field(formData, "clock_version_id");
  const path = templatePath(templateId);

  const position = Number.parseInt(field(formData, "position"), 10);
  const durationSeconds = Number.parseInt(field(formData, "duration_seconds"), 10);
  if (!Number.isFinite(position) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    failWith(path, "Give the slot a position and a duration greater than zero.");
  }

  const timingMode = field(formData, "timing_mode") as LogSlotTimingMode;
  if (!TIMING_MODES.includes(timingMode)) failWith(path, "That is not a recognized timing mode.");

  const startOffsetRaw = optionalField(formData, "start_offset_seconds");
  const startOffsetSeconds = startOffsetRaw === null ? null : Number.parseInt(startOffsetRaw, 10);

  const supabase = await createClient();
  const { error } = await supabase.from("log_clock_slots").insert({
    clock_version_id: versionId,
    position,
    start_offset_seconds: startOffsetSeconds,
    duration_seconds: durationSeconds,
    timing_mode: timingMode,
    label: optionalField(formData, "label"),
    segment_label: optionalField(formData, "segment_label"),
  });
  failIfError(error, path, "Could not add the slot");

  revalidatePath(path);
  redirect(path);
}

const REQUIREMENTS: LogOpportunityRequirement[] = ["optional", "required"];

function readPermittedContentTypes(formData: FormData): string[] {
  const allowed = new Set(PERMITTED_CONTENT_TYPE_OPTIONS.map((option) => option.value));
  return formData.getAll("permitted_content_types").map(String).filter((value) => allowed.has(value));
}

/**
 * Marks an existing network slot as eligible for local content — a WUWF
 * local opportunity is now always a reference to a real network slot, not
 * an independently-authored time range (see 20260809170000_log_local_
 * opportunities_slot_based.sql and CLAUDE.md's dated note): offset,
 * duration, timing, and label all come from the slot itself, so an
 * opportunity can never drift out of sync with the clock it describes.
 * Confirmed directly: any slot, including a required one like a newscast,
 * can be marked eligible and filled independently — there's no "only as
 * part of a group" mode. Unlike clock slots themselves, opportunities are
 * editable in place (update, not insert-only) — see
 * deactivateLocalOpportunity below.
 *
 * Upserts on slot_id rather than a bare insert: slot_id is unique forever
 * (log_local_opportunities_slot_id_key), and deactivating an opportunity
 * doesn't delete its row, only flips active to false — so a slot that was
 * ever marked eligible and later deactivated already has a row waiting on
 * that same slot_id. A plain insert to mark it eligible again hit that
 * constraint head-on ("duplicate key value violates unique constraint
 * log_local_opportunities_slot_id_key"), a real, confirmed bug: the clock
 * detail screen's own read (getClockTemplateDetail) only shows active = true
 * opportunities, so a producer sees an ordinary "not yet eligible" slot with
 * no sign the row already exists. Upserting reactivates and overwrites that
 * row with this call's own values instead of trying to create a second one.
 */
export async function addLocalOpportunity(formData: FormData): Promise<void> {
  const { profile } = await assertLogProducer();
  const templateId = field(formData, "clock_template_id");
  const versionId = field(formData, "clock_version_id");
  const slotId = field(formData, "slot_id");
  const path = templatePath(templateId);
  if (slotId === "") failWith(path, "Choose which network slot this opportunity marks eligible.");

  const requirement = field(formData, "requirement") as LogOpportunityRequirement;
  if (!REQUIREMENTS.includes(requirement)) failWith(path, "That is not a recognized requirement.");

  const supabase = await createClient();
  const { error } = await supabase.from("log_local_opportunities").upsert(
    {
      clock_version_id: versionId,
      slot_id: slotId,
      requirement,
      permitted_content_types: readPermittedContentTypes(formData),
      notes: optionalField(formData, "notes"),
      created_by: profile.id,
      active: true,
    },
    { onConflict: "slot_id" },
  );
  failIfError(error, path, "Could not mark this slot eligible for local content");

  revalidatePath(path);
  redirect(path);
}

/**
 * Edits a WUWF local-substitution opportunity in place — the RLS layer has
 * allowed this since the opportunity was split from the network clock (see
 * addLocalOpportunity above). Which slot an opportunity marks eligible is
 * its identity, not an editable field — to point at a different slot,
 * deactivate this one and mark the other slot eligible instead. Only
 * requirement/permitted_content_types/notes can change here.
 */
export async function updateLocalOpportunity(formData: FormData): Promise<void> {
  await assertLogProducer();
  const templateId = field(formData, "clock_template_id");
  const opportunityId = field(formData, "opportunity_id");
  const path = templatePath(templateId);

  const requirement = field(formData, "requirement") as LogOpportunityRequirement;
  if (!REQUIREMENTS.includes(requirement)) failWith(path, "That is not a recognized requirement.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("log_local_opportunities")
    .update({
      requirement,
      permitted_content_types: readPermittedContentTypes(formData),
      notes: optionalField(formData, "notes"),
    })
    .eq("id", opportunityId);
  failIfError(error, path, "Could not update the local opportunity");

  revalidatePath(path);
  redirect(path);
}

/** Deactivates a local opportunity (doesn't delete it) — the same deactivate-don't-delete lifecycle log_content_items uses. */
export async function deactivateLocalOpportunity(formData: FormData): Promise<void> {
  await assertLogProducer();
  const templateId = field(formData, "clock_template_id");
  const opportunityId = field(formData, "opportunity_id");
  const path = templatePath(templateId);

  const supabase = await createClient();
  const { error } = await supabase
    .from("log_local_opportunities")
    .update({ active: false })
    .eq("id", opportunityId);
  failIfError(error, path, "Could not deactivate this opportunity");

  revalidatePath(path);
  redirect(path);
}

const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6];

function readDaysOfWeek(formData: FormData): number[] {
  return formData
    .getAll("days_of_week")
    .map((value) => Number.parseInt(String(value), 10))
    .filter((value) => DAYS_OF_WEEK.includes(value));
}

/**
 * Pins a content-library item to a local opportunity — the general
 * mechanism legal-ID auto-placement is now just one instance of, not a
 * content-type-specific heuristic (see CLAUDE.md's dated note and
 * lib/log/opportunity-assignments.ts). Generation places it automatically
 * from then on via lib/log/opportunity-assignment-placement.ts (Log's own
 * path) and lib/underwriting/rundown-provisioning.ts (auto-fill-provisioned
 * rundowns). An empty hour_index means every hour the opportunity recurs;
 * an empty days_of_week means every day.
 */
export async function assignOpportunityContent(formData: FormData): Promise<void> {
  const { profile } = await assertLogProducer();
  const templateId = field(formData, "clock_template_id");
  const opportunityId = field(formData, "opportunity_id");
  const path = templatePath(templateId);
  if (opportunityId === "") failWith(path, "Choose which opportunity to pin content to.");

  const contentItemId = field(formData, "content_item_id");
  if (contentItemId === "") failWith(path, "Choose a content item to pin.");

  const hourIndexRaw = optionalField(formData, "hour_index");
  const hourIndex = hourIndexRaw === null ? null : Number.parseInt(hourIndexRaw, 10);
  if (hourIndex !== null && (!Number.isFinite(hourIndex) || hourIndex < 0)) {
    failWith(path, "Hour must be zero or a positive whole number, or left blank for every hour.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("log_opportunity_assignments").insert({
    local_opportunity_id: opportunityId,
    content_item_id: contentItemId,
    hour_index: hourIndex,
    days_of_week: readDaysOfWeek(formData),
    notes: optionalField(formData, "notes"),
    created_by: profile.id,
  });
  failIfError(error, path, "Could not pin this content item");

  revalidatePath(path);
  redirect(path);
}

/** Deactivates a content assignment (doesn't delete it) — same lifecycle as deactivateLocalOpportunity. */
export async function deactivateOpportunityAssignment(formData: FormData): Promise<void> {
  await assertLogProducer();
  const templateId = field(formData, "clock_template_id");
  const assignmentId = field(formData, "assignment_id");
  const path = templatePath(templateId);

  const supabase = await createClient();
  const { error } = await supabase
    .from("log_opportunity_assignments")
    .update({ active: false })
    .eq("id", assignmentId);
  failIfError(error, path, "Could not remove this content assignment");

  revalidatePath(path);
  redirect(path);
}
