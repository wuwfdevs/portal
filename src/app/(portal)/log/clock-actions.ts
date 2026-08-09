"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertLogProducer } from "@/lib/log/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
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

/**
 * Adds a WUWF local-substitution opportunity over a clock version — the
 * overlay that replaces fill_mode (see 20260808120000_log_local_
 * opportunities.sql and CLAUDE.md's "Log domain redesign" note). Unlike
 * clock slots, opportunities are editable in place (update, not insert-only)
 * — see deactivateLocalOpportunity below.
 */
export async function addLocalOpportunity(formData: FormData): Promise<void> {
  const { profile } = await assertLogProducer();
  const templateId = field(formData, "clock_template_id");
  const versionId = field(formData, "clock_version_id");
  const path = templatePath(templateId);

  const position = Number.parseInt(field(formData, "position"), 10);
  const startOffsetSeconds = Number.parseInt(field(formData, "start_offset_seconds"), 10);
  const durationSeconds = Number.parseInt(field(formData, "duration_seconds"), 10);
  const label = field(formData, "label");
  if (label === "") failWith(path, "Give this opportunity a short label.");
  if (!Number.isFinite(position) || !Number.isFinite(startOffsetSeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    failWith(path, "Give the opportunity a position, start offset, and a duration greater than zero.");
  }

  const requirement = field(formData, "requirement") as LogOpportunityRequirement;
  if (!REQUIREMENTS.includes(requirement)) failWith(path, "That is not a recognized requirement.");
  const timingMode = field(formData, "timing_mode") as LogSlotTimingMode;
  if (!TIMING_MODES.includes(timingMode)) failWith(path, "That is not a recognized timing mode.");

  const earliestRaw = optionalField(formData, "earliest_start_offset_seconds");
  const latestRaw = optionalField(formData, "latest_start_offset_seconds");
  if (timingMode === "float" && (earliestRaw === null || latestRaw === null)) {
    failWith(path, "A floating opportunity needs both an earliest and latest permitted start.");
  }

  const permittedContentTypes = field(formData, "permitted_content_types")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");

  const supabase = await createClient();
  const { error } = await supabase.from("log_local_opportunities").insert({
    clock_version_id: versionId,
    position,
    label,
    requirement,
    timing_mode: timingMode,
    start_offset_seconds: startOffsetSeconds,
    duration_seconds: durationSeconds,
    earliest_start_offset_seconds: timingMode === "float" ? Number.parseInt(earliestRaw!, 10) : null,
    latest_start_offset_seconds: timingMode === "float" ? Number.parseInt(latestRaw!, 10) : null,
    permitted_content_types: permittedContentTypes,
    allow_multiple: formData.get("allow_multiple") === "on",
    notes: optionalField(formData, "notes"),
    created_by: profile.id,
  });
  failIfError(error, path, "Could not add the local opportunity");

  revalidatePath(path);
  redirect(path);
}

/**
 * Edits a WUWF local-substitution opportunity in place — the RLS layer has
 * allowed this since the opportunity was split from the network clock (see
 * addLocalOpportunity above), but no action or form ever exercised it until
 * now. Same field set and validation as addLocalOpportunity, applied as an
 * update against an existing row instead of an insert.
 */
export async function updateLocalOpportunity(formData: FormData): Promise<void> {
  await assertLogProducer();
  const templateId = field(formData, "clock_template_id");
  const opportunityId = field(formData, "opportunity_id");
  const path = templatePath(templateId);

  const position = Number.parseInt(field(formData, "position"), 10);
  const startOffsetSeconds = Number.parseInt(field(formData, "start_offset_seconds"), 10);
  const durationSeconds = Number.parseInt(field(formData, "duration_seconds"), 10);
  const label = field(formData, "label");
  if (label === "") failWith(path, "Give this opportunity a short label.");
  if (!Number.isFinite(position) || !Number.isFinite(startOffsetSeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    failWith(path, "Give the opportunity a position, start offset, and a duration greater than zero.");
  }

  const requirement = field(formData, "requirement") as LogOpportunityRequirement;
  if (!REQUIREMENTS.includes(requirement)) failWith(path, "That is not a recognized requirement.");
  const timingMode = field(formData, "timing_mode") as LogSlotTimingMode;
  if (!TIMING_MODES.includes(timingMode)) failWith(path, "That is not a recognized timing mode.");

  const earliestRaw = optionalField(formData, "earliest_start_offset_seconds");
  const latestRaw = optionalField(formData, "latest_start_offset_seconds");
  if (timingMode === "float" && (earliestRaw === null || latestRaw === null)) {
    failWith(path, "A floating opportunity needs both an earliest and latest permitted start.");
  }

  const permittedContentTypes = field(formData, "permitted_content_types")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");

  const supabase = await createClient();
  const { error } = await supabase
    .from("log_local_opportunities")
    .update({
      position,
      label,
      requirement,
      timing_mode: timingMode,
      start_offset_seconds: startOffsetSeconds,
      duration_seconds: durationSeconds,
      earliest_start_offset_seconds: timingMode === "float" ? Number.parseInt(earliestRaw!, 10) : null,
      latest_start_offset_seconds: timingMode === "float" ? Number.parseInt(latestRaw!, 10) : null,
      permitted_content_types: permittedContentTypes,
      allow_multiple: formData.get("allow_multiple") === "on",
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
