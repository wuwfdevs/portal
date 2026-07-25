// Pure validation for the configurable pitch form. The schema is data
// (ep_form_fields rows); this module checks submitted values against it
// without touching Supabase, so it runs under Vitest directly.

import type { EpFieldType, EpFieldValue } from "@/lib/database.types";

export interface FormFieldDef {
  id: string;
  key: string;
  label: string;
  field_type: EpFieldType;
  options: string[] | null;
  required: boolean;
}

export interface PitchValidationResult {
  /** One entry per field that has a value; empty optional fields are omitted. */
  values: { fieldId: string; value: EpFieldValue }[];
  /** Keyed by field key for rendering next to the offending input. */
  errors: Record<string, string>;
}

const URL_PATTERN = /^https?:\/\/\S+$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function validatePitchValues(
  fields: FormFieldDef[],
  raw: Record<string, EpFieldValue | undefined>,
): PitchValidationResult {
  const values: { fieldId: string; value: EpFieldValue }[] = [];
  const errors: Record<string, string> = {};

  for (const field of fields) {
    const rawValue = raw[field.key];

    if (field.field_type === "multi_select") {
      const selected = (Array.isArray(rawValue) ? rawValue : rawValue ? [rawValue] : []).filter(
        Boolean,
      );
      if (selected.length === 0) {
        if (field.required) errors[field.key] = `${field.label} is required.`;
        continue;
      }
      if (selected.some((option) => !(field.options ?? []).includes(option))) {
        errors[field.key] = `${field.label} has an unrecognized option.`;
        continue;
      }
      values.push({ fieldId: field.id, value: selected });
      continue;
    }

    const text = (Array.isArray(rawValue) ? rawValue[0] : rawValue)?.trim() ?? "";
    if (text === "") {
      if (field.required) errors[field.key] = `${field.label} is required.`;
      continue;
    }

    if (field.field_type === "select" && !(field.options ?? []).includes(text)) {
      errors[field.key] = `${field.label} has an unrecognized option.`;
      continue;
    }
    if (field.field_type === "url" && !URL_PATTERN.test(text)) {
      errors[field.key] = `${field.label} must be a full link starting with http:// or https://.`;
      continue;
    }
    if (field.field_type === "date" && (!DATE_PATTERN.test(text) || isNaN(Date.parse(text)))) {
      errors[field.key] = `${field.label} must be a valid date.`;
      continue;
    }

    values.push({ fieldId: field.id, value: text });
  }

  return { values, errors };
}

/** Stable key for a new form field, derived from its label ("Why now?" -> "why_now"). */
export function fieldKeyFromLabel(label: string, existingKeys: string[]): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "field";
  if (!existingKeys.includes(base)) return base;
  let suffix = 2;
  while (existingKeys.includes(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}
