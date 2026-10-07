"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CheckboxField, Field, Input, Select, Textarea } from "@/components/ui/input";
import { SecondaryLink } from "@/components/ui/primary-link";
import { savePitch, type PitchFormState } from "./actions";
import {
  NON_PILLAR_OPTIONS,
  PILLAR_CONTRIBUTION_FIELD_KEY,
  PRIMARY_PILLAR_FIELD_KEY,
} from "@/lib/editorial/form";
import type { EpFieldValue, EpFieldType } from "@/lib/database.types";

// The schema-driven renderer for the configurable pitch form: one flat,
// ordered list of typed fields (see docs/editorial-planning-design.md §4.1).
// Client component so validation errors keep the writer's input.

export interface PitchFormField {
  id: string;
  key: string;
  label: string;
  help_text: string | null;
  field_type: EpFieldType;
  options: string[] | null;
  required: boolean;
}

const initialState: PitchFormState = { status: "idle" };

const TEXT_INPUT_TYPE: Partial<Record<EpFieldType, string>> = {
  short_text: "text",
  url: "url",
  date: "date",
};

export function PitchForm({
  fields,
  pitchId,
  initialTitle = "",
  initialValues = {},
  cancelHref,
}: {
  fields: PitchFormField[];
  pitchId?: string;
  initialTitle?: string;
  initialValues?: Record<string, EpFieldValue>;
  cancelHref: string;
}) {
  const [state, formAction, isPending] = useActionState(savePitch, initialState);
  const errors = state.status === "error" ? state.fieldErrors : {};
  const title = state.status === "error" ? state.title : initialTitle;
  const values = state.status === "error" ? state.values : initialValues;

  const initialPillar = values[PRIMARY_PILLAR_FIELD_KEY];
  const [primaryPillar, setPrimaryPillar] = useState(
    Array.isArray(initialPillar) ? "" : (initialPillar ?? ""),
  );
  const pillarContributionRequired =
    primaryPillar !== "" && !NON_PILLAR_OPTIONS.includes(primaryPillar);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {pitchId && <input type="hidden" name="pitch_id" value={pitchId} />}
      {state.status === "error" && state.message && <Alert>{state.message}</Alert>}

      <Field label="Title" htmlFor="title" required error={errors.title}>
        <Input
          id="title"
          name="title"
          defaultValue={title}
          maxLength={200}
          required
          aria-invalid={errors.title ? true : undefined}
          placeholder="One line that says what the story is"
        />
      </Field>

      {fields.map((field) => {
        const name = `field_${field.key}`;
        const value = values[field.key];
        const text = Array.isArray(value) ? "" : (value ?? "");
        const selected = Array.isArray(value) ? value : value ? [value] : [];
        const invalid = errors[field.key] ? true : undefined;
        const isPillarContribution = field.key === PILLAR_CONTRIBUTION_FIELD_KEY;
        const required = isPillarContribution ? pillarContributionRequired : field.required;

        return (
          <Field
            key={field.id}
            label={field.label}
            htmlFor={name}
            required={required}
            error={errors[field.key]}
            hint={errors[field.key] ? undefined : field.help_text}
          >
            {field.field_type === "long_text" ? (
              <Textarea
                id={name}
                name={name}
                defaultValue={text}
                rows={4}
                aria-invalid={invalid}
                required={isPillarContribution ? pillarContributionRequired : undefined}
              />
            ) : field.field_type === "select" ? (
              <Select
                id={name}
                name={name}
                defaultValue={text}
                aria-invalid={invalid}
                onChange={
                  field.key === PRIMARY_PILLAR_FIELD_KEY
                    ? (event) => setPrimaryPillar(event.target.value)
                    : undefined
                }
              >
                <option value="">Choose…</option>
                {(field.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            ) : field.field_type === "multi_select" ? (
              <div className="flex flex-col gap-2 pt-1">
                {(field.options ?? []).map((option) => (
                  <CheckboxField
                    key={option}
                    name={name}
                    value={option}
                    defaultChecked={selected.includes(option)}
                    label={option}
                  />
                ))}
              </div>
            ) : (
              <Input
                id={name}
                name={name}
                type={TEXT_INPUT_TYPE[field.field_type] ?? "text"}
                defaultValue={text}
                aria-invalid={invalid}
              />
            )}
          </Field>
        );
      })}

      <div className="flex justify-end gap-2.5 border-t border-line pt-4">
        <SecondaryLink href={cancelHref}>Cancel</SecondaryLink>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : pitchId ? "Save changes" : "Submit pitch"}
        </Button>
      </div>
    </form>
  );
}
