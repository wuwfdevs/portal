"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertLogProducer } from "@/lib/log/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import type {
  LogClockVersionVariant,
  LogSlotAssignmentMode,
  LogSlotFillMode,
  LogSlotTimingMode,
} from "@/lib/database.types";

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

const FILL_MODES: LogSlotFillMode[] = ["required", "optional", "host_fillable"];
const ASSIGNMENT_MODES: LogSlotAssignmentMode[] = ["automatic", "preassigned", "host_selected"];
const TIMING_MODES: LogSlotTimingMode[] = ["fixed", "float"];

/** Appends one slot to a clock version. Insert-only, same reasoning as the version itself. */
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

  const fillMode = field(formData, "fill_mode") as LogSlotFillMode;
  if (!FILL_MODES.includes(fillMode)) failWith(path, "That is not a recognized fill mode.");
  const assignmentMode = field(formData, "assignment_mode") as LogSlotAssignmentMode;
  if (!ASSIGNMENT_MODES.includes(assignmentMode)) {
    failWith(path, "That is not a recognized assignment mode.");
  }
  const timingMode = field(formData, "timing_mode") as LogSlotTimingMode;
  if (!TIMING_MODES.includes(timingMode)) failWith(path, "That is not a recognized timing mode.");

  const startOffsetRaw = optionalField(formData, "start_offset_seconds");
  const startOffsetSeconds = startOffsetRaw === null ? null : Number.parseInt(startOffsetRaw, 10);
  const permittedContentTypes = field(formData, "permitted_content_types")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");

  const supabase = await createClient();
  const { error } = await supabase.from("log_clock_slots").insert({
    clock_version_id: versionId,
    position,
    start_offset_seconds: startOffsetSeconds,
    duration_seconds: durationSeconds,
    permitted_content_types: permittedContentTypes,
    fill_mode: fillMode,
    assignment_mode: assignmentMode,
    replaceable: formData.get("replaceable") === "on",
    shortenable: formData.get("shortenable") === "on",
    allow_empty: formData.get("allow_empty") === "on",
    allow_multiple: formData.get("allow_multiple") === "on",
    timing_mode: timingMode,
    lock_on_air: formData.get("lock_on_air") === "on",
    label: optionalField(formData, "label"),
  });
  failIfError(error, path, "Could not add the slot");

  revalidatePath(path);
  redirect(path);
}
