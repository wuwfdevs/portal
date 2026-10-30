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

// Deliberately not exported from add-field-form.tsx (a "use client" module):
// a Server Component importing a plain constant across that boundary is
// fragile — it type-checks and works in dev, but broke in the actual
// production Turbopack bundle (settings/form/[id]/edit threw "Cannot read
// properties of undefined (reading 'toLowerCase')" because FIELD_TYPE_LABEL
// came back undefined there). Living in this plain module, it's safe to
// import from server or client code alike.
export const FIELD_TYPE_LABEL: Record<EpFieldType, string> = {
  short_text: "Short text",
  long_text: "Long text",
  select: "Select (one)",
  multi_select: "Select (several)",
  date: "Date",
  url: "Link",
};

export interface PitchValidationResult {
  /** One entry per field that has a value; empty optional fields are omitted. */
  values: { fieldId: string; value: EpFieldValue }[];
  /** Keyed by field key for rendering next to the offending input. */
  errors: Record<string, string>;
}

const URL_PATTERN = /^https?:\/\/\S+$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// The one deliberate piece of field interdependency in this form (per
// CLAUDE.md: useful, narrow conditional validation — not a general
// conditional-logic builder). primary_pillar's status-only options describe
// pitches that don't map to a defined pillar; contribution is only required
// when a real pillar was chosen. Both are seeded keys, not guaranteed to
// exist if a newsroom retires them, so callers must tolerate their absence.
export const PRIMARY_PILLAR_FIELD_KEY = "primary_pillar";
export const PILLAR_CONTRIBUTION_FIELD_KEY = "pillar_contribution";
export const NON_PILLAR_OPTIONS = [
  "Outside current pillars",
  "Emerging issue / possible future priority",
  "Immediate public need",
];

/** Whether the selected primary pillar is a defined pillar (not a status option). */
export function pillarContributionRequired(raw: Record<string, EpFieldValue | undefined>): boolean {
  const value = raw[PRIMARY_PILLAR_FIELD_KEY];
  const text = Array.isArray(value) ? value[0] : value;
  if (!text) return false;
  return !NON_PILLAR_OPTIONS.includes(text);
}

// primary_pillar's options and help text are derived live from ep_pillars
// (a first-class, admin-configurable table — see Settings → Pillars)
// rather than stored on the field row, so they can never drift out of sync
// with what's actually configured. These are pure so the derivation is
// testable without touching Supabase; data.ts calls withPillarOptions when
// it loads the fields writers actually see.

export interface PillarOption {
  name: string;
  guiding_question: string | null;
}

/** The full primary_pillar picklist: configured pillars, then the fixed status options. */
export function pillarSelectOptions(pillars: PillarOption[]): string[] {
  return [...pillars.map((pillar) => pillar.name), ...NON_PILLAR_OPTIONS];
}

export function pillarHelpText(pillars: PillarOption[]): string {
  const closer = "If this doesn't map to a current pillar, say so instead of forcing a fit.";
  if (pillars.length === 0) {
    return `No coverage pillars are configured yet — add them in Settings → Pillars. ${closer}`;
  }
  const summary = pillars
    .map((pillar) =>
      pillar.guiding_question ? `${pillar.name} (${pillar.guiding_question})` : pillar.name,
    )
    .join("; ");
  return `WUWF's coverage pillars, each built around a guiding question — ${summary}. ${closer}`;
}

/** Merges live pillar data into primary_pillar's options/help_text; other fields pass through untouched. */
export function withPillarOptions<
  T extends { key: string; options: string[] | null; help_text: string | null },
>(field: T, pillars: PillarOption[]): T {
  if (field.key !== PRIMARY_PILLAR_FIELD_KEY) return field;
  return { ...field, options: pillarSelectOptions(pillars), help_text: pillarHelpText(pillars) };
}

export function validatePitchValues(
  fields: FormFieldDef[],
  raw: Record<string, EpFieldValue | undefined>,
): PitchValidationResult {
  const values: { fieldId: string; value: EpFieldValue }[] = [];
  const errors: Record<string, string> = {};
  const pillarRequired = pillarContributionRequired(raw);

  for (const field of fields) {
    const rawValue = raw[field.key];
    const effectiveRequired =
      field.key === PILLAR_CONTRIBUTION_FIELD_KEY ? pillarRequired : field.required;

    if (field.field_type === "multi_select") {
      const selected = (Array.isArray(rawValue) ? rawValue : rawValue ? [rawValue] : []).filter(
        Boolean,
      );
      if (selected.length === 0) {
        if (effectiveRequired) errors[field.key] = `${field.label} is required.`;
        continue;
      }
      if (selected.some((option) => !(field.options ?? []).includes(option))) {
        errors[field.key] =
          `${field.label} has an unrecognized option. Allowed: ${(field.options ?? []).join(", ")}.`;
        continue;
      }
      values.push({ fieldId: field.id, value: selected });
      continue;
    }

    const text = (Array.isArray(rawValue) ? rawValue[0] : rawValue)?.trim() ?? "";
    if (text === "") {
      if (effectiveRequired) {
        errors[field.key] =
          field.key === PILLAR_CONTRIBUTION_FIELD_KEY
            ? `${field.label} is required when a defined pillar is selected.`
            : `${field.label} is required.`;
      }
      continue;
    }

    if (field.field_type === "select" && !(field.options ?? []).includes(text)) {
      errors[field.key] =
        `${field.label} has an unrecognized option. Allowed: ${(field.options ?? []).join(", ")}.`;
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
