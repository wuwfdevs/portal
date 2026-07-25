"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertEditorialRole } from "@/lib/editorial/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { listCriteria, listFormFields } from "@/lib/editorial/data";
import { fieldKeyFromLabel } from "@/lib/editorial/form";
import { logAuditEvent } from "@/lib/audit";
import type { EpFieldType } from "@/lib/database.types";

const FIELD_TYPES: EpFieldType[] = [
  "short_text",
  "long_text",
  "select",
  "multi_select",
  "date",
  "url",
];

const FORM_PATH = "/editorial/settings/form";
const RUBRIC_PATH = "/editorial/settings/rubric";

/** Only select-style fields carry an options list. */
function takesOptions(fieldType: EpFieldType): boolean {
  return fieldType === "select" || fieldType === "multi_select";
}

/** The options textarea: one option per line, blank lines dropped. */
function parseOptions(formData: FormData): string[] {
  return String(formData.get("options") ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

// Submission form fields ------------------------------------------------------

export async function createFormField(formData: FormData): Promise<void> {
  const editor = await assertEditorialRole("editor");
  const label = String(formData.get("label") ?? "").trim();
  const helpText = String(formData.get("help_text") ?? "").trim() || null;
  const fieldTypeRaw = String(formData.get("field_type") ?? "short_text");
  const fieldType = FIELD_TYPES.includes(fieldTypeRaw as EpFieldType)
    ? (fieldTypeRaw as EpFieldType)
    : "short_text";
  const required = formData.get("required") === "on";

  if (!label) failWith(FORM_PATH, "Give the field a label.");

  const options = takesOptions(fieldType) ? parseOptions(formData) : null;
  if (options !== null && options.length === 0) {
    failWith(FORM_PATH, "A select field needs at least one option, one per line.");
  }

  const existing = await listFormFields();
  const key = fieldKeyFromLabel(
    label,
    existing.map((field) => field.key),
  );
  const sortOrder = Math.max(0, ...existing.map((field) => field.sort_order)) + 1;

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("ep_form_fields")
    .insert({
      key,
      label,
      help_text: helpText,
      field_type: fieldType,
      options,
      required,
      sort_order: sortOrder,
    })
    .select("id")
    .single();
  failIfError(error, FORM_PATH, "Could not add the field");
  if (!created) failWith(FORM_PATH, "Could not add the field — no row was created.");

  await logAuditEvent({
    actorId: editor.profile.id,
    action: "ep.form_field.created",
    targetType: "ep_form_field",
    targetId: created.id,
    metadata: { key, label, field_type: fieldType },
  });

  redirect(FORM_PATH);
}

export async function updateFormField(formData: FormData): Promise<void> {
  const editor = await assertEditorialRole("editor");
  const fieldId = String(formData.get("field_id") ?? "");
  const editPath = `${FORM_PATH}/${fieldId}/edit`;
  const label = String(formData.get("label") ?? "").trim();
  const helpText = String(formData.get("help_text") ?? "").trim() || null;
  const required = formData.get("required") === "on";

  if (!label) failWith(editPath, "Give the field a label.");

  const supabase = await createClient();
  const { data: field, error: loadError } = await supabase
    .from("ep_form_fields")
    .select("field_type")
    .eq("id", fieldId)
    .maybeSingle();
  failIfError(loadError, editPath, "Could not load the field");
  if (!field) failWith(FORM_PATH, "That field no longer exists.");

  // Field type is fixed after creation, so an options list is required for the
  // life of a select field — emptying the box would leave nothing to choose.
  const options = takesOptions(field.field_type) ? parseOptions(formData) : null;
  if (options !== null && options.length === 0) {
    failWith(editPath, "A select field needs at least one option, one per line.");
  }

  const { error } = await supabase
    .from("ep_form_fields")
    .update({ label, help_text: helpText, required, ...(options !== null ? { options } : {}) })
    .eq("id", fieldId);
  failIfError(error, editPath, "Could not save the field");

  await logAuditEvent({
    actorId: editor.profile.id,
    action: "ep.form_field.updated",
    targetType: "ep_form_field",
    targetId: fieldId,
    metadata: { label },
  });

  redirect(FORM_PATH);
}

export async function toggleFormFieldActive(formData: FormData): Promise<void> {
  const editor = await assertEditorialRole("editor");
  const fieldId = String(formData.get("field_id") ?? "");
  const nextActive = String(formData.get("next_active") ?? "") === "true";

  const supabase = await createClient();
  const { error } = await supabase
    .from("ep_form_fields")
    .update({ active: nextActive })
    .eq("id", fieldId);
  failIfError(error, FORM_PATH, `Could not ${nextActive ? "reactivate" : "deactivate"} the field`);

  await logAuditEvent({
    actorId: editor.profile.id,
    action: nextActive ? "ep.form_field.activated" : "ep.form_field.deactivated",
    targetType: "ep_form_field",
    targetId: fieldId,
  });

  redirect(FORM_PATH);
}

export async function moveFormField(formData: FormData): Promise<void> {
  await assertEditorialRole("editor");
  const fieldId = String(formData.get("field_id") ?? "");
  const direction = String(formData.get("direction") ?? "") === "up" ? -1 : 1;

  const fields = await listFormFields();
  const index = fields.findIndex((field) => field.id === fieldId);
  const target = index + direction;
  const moving = fields[index];
  const neighbor = fields[target];
  if (!moving || !neighbor) redirect(FORM_PATH);

  const reordered = [...fields];
  reordered[index] = neighbor;
  reordered[target] = moving;

  const supabase = await createClient();
  for (const [position, field] of reordered.entries()) {
    if (field.sort_order !== position + 1) {
      const { error } = await supabase
        .from("ep_form_fields")
        .update({ sort_order: position + 1 })
        .eq("id", field.id);
      failIfError(error, FORM_PATH, "Could not reorder the fields");
    }
  }

  redirect(FORM_PATH);
}

// Rubric criteria -------------------------------------------------------------

export async function createCriterion(formData: FormData): Promise<void> {
  const editor = await assertEditorialRole("editor");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const guidance = String(formData.get("guidance") ?? "").trim() || null;
  const weight = Number(formData.get("weight") ?? 1);

  if (!name || !description) {
    failWith(RUBRIC_PATH, "Name and description are required.");
  }
  if (!Number.isFinite(weight) || weight <= 0 || weight > 10) {
    failWith(RUBRIC_PATH, "Weight must be between 0 and 10.");
  }

  const existing = await listCriteria();
  const sortOrder = Math.max(0, ...existing.map((criterion) => criterion.sort_order)) + 1;

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("ep_criteria")
    .insert({ name, description, guidance, weight, sort_order: sortOrder })
    .select("id")
    .single();
  failIfError(error, RUBRIC_PATH, "Could not add the criterion");
  if (!created) failWith(RUBRIC_PATH, "Could not add the criterion — no row was created.");

  await logAuditEvent({
    actorId: editor.profile.id,
    action: "ep.criterion.created",
    targetType: "ep_criterion",
    targetId: created.id,
    metadata: { name, weight },
  });

  redirect(RUBRIC_PATH);
}

export async function updateCriterion(formData: FormData): Promise<void> {
  const editor = await assertEditorialRole("editor");
  const criterionId = String(formData.get("criterion_id") ?? "");
  const editPath = `${RUBRIC_PATH}/${criterionId}/edit`;
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const guidance = String(formData.get("guidance") ?? "").trim() || null;
  const weight = Number(formData.get("weight") ?? 1);

  if (!name || !description || !Number.isFinite(weight) || weight <= 0 || weight > 10) {
    failWith(editPath, "Name, description, and a weight between 0 and 10 are required.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("ep_criteria")
    .update({ name, description, guidance, weight })
    .eq("id", criterionId);
  failIfError(error, editPath, "Could not save the criterion");

  await logAuditEvent({
    actorId: editor.profile.id,
    action: "ep.criterion.updated",
    targetType: "ep_criterion",
    targetId: criterionId,
    metadata: { name, weight },
  });

  redirect(RUBRIC_PATH);
}

export async function toggleCriterionActive(formData: FormData): Promise<void> {
  const editor = await assertEditorialRole("editor");
  const criterionId = String(formData.get("criterion_id") ?? "");
  const nextActive = String(formData.get("next_active") ?? "") === "true";

  const supabase = await createClient();
  const { error } = await supabase
    .from("ep_criteria")
    .update({ active: nextActive })
    .eq("id", criterionId);
  failIfError(
    error,
    RUBRIC_PATH,
    `Could not ${nextActive ? "reactivate" : "deactivate"} the criterion`,
  );

  await logAuditEvent({
    actorId: editor.profile.id,
    action: nextActive ? "ep.criterion.activated" : "ep.criterion.deactivated",
    targetType: "ep_criterion",
    targetId: criterionId,
  });

  redirect(RUBRIC_PATH);
}

export async function moveCriterion(formData: FormData): Promise<void> {
  await assertEditorialRole("editor");
  const criterionId = String(formData.get("criterion_id") ?? "");
  const direction = String(formData.get("direction") ?? "") === "up" ? -1 : 1;

  const criteria = await listCriteria();
  const index = criteria.findIndex((criterion) => criterion.id === criterionId);
  const target = index + direction;
  const moving = criteria[index];
  const neighbor = criteria[target];
  if (!moving || !neighbor) redirect(RUBRIC_PATH);

  const reordered = [...criteria];
  reordered[index] = neighbor;
  reordered[target] = moving;

  const supabase = await createClient();
  for (const [position, criterion] of reordered.entries()) {
    if (criterion.sort_order !== position + 1) {
      const { error } = await supabase
        .from("ep_criteria")
        .update({ sort_order: position + 1 })
        .eq("id", criterion.id);
      failIfError(error, RUBRIC_PATH, "Could not reorder the rubric");
    }
  }

  redirect(RUBRIC_PATH);
}

export async function updateScale(formData: FormData): Promise<void> {
  const editor = await assertEditorialRole("editor");
  const scaleMin = Number(formData.get("scale_min") ?? 1);
  const scaleMax = Number(formData.get("scale_max") ?? 5);

  if (
    !Number.isInteger(scaleMin) ||
    !Number.isInteger(scaleMax) ||
    scaleMin < 0 ||
    scaleMax > 10 ||
    scaleMin >= scaleMax
  ) {
    failWith(RUBRIC_PATH, "The scale needs whole numbers between 0 and 10, with min below max.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("ep_settings")
    .update({ scale_min: scaleMin, scale_max: scaleMax })
    .eq("id", true);
  failIfError(error, RUBRIC_PATH, "Could not save the scale");

  await logAuditEvent({
    actorId: editor.profile.id,
    action: "ep.settings.scale_updated",
    targetType: "ep_settings",
    metadata: { scale_min: scaleMin, scale_max: scaleMax },
  });

  redirect(RUBRIC_PATH);
}
