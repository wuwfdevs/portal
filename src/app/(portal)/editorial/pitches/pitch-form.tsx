"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
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

      <div>
        <Label htmlFor="title">
          Title <span className="text-danger">*</span>
        </Label>
        <Input
          id="title"
          name="title"
          defaultValue={title}
          maxLength={200}
          required
          aria-invalid={errors.title ? true : undefined}
          placeholder="One line that says what the story is"
        />
        {errors.title && <FieldError>{errors.title}</FieldError>}
      </div>

      {fields.map((field) => {
        const name = `field_${field.key}`;
        const value = values[field.key];
        const text = Array.isArray(value) ? "" : (value ?? "");
        const selected = Array.isArray(value) ? value : value ? [value] : [];
        const invalid = errors[field.key] ? true : undefined;
        const isPillarContribution = field.key === PILLAR_CONTRIBUTION_FIELD_KEY;
        const required = isPillarContribution ? pillarContributionRequired : field.required;

        return (
          <div key={field.id}>
            <Label htmlFor={name}>
              {field.label}
              {required && <span className="text-danger"> *</span>}
            </Label>
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
                  <label key={option} className="flex items-center gap-2 text-sm text-ink-900">
                    <input
                      type="checkbox"
                      name={name}
                      value={option}
                      defaultChecked={selected.includes(option)}
                      className="h-4 w-4"
                    />
                    {option}
                  </label>
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
            {errors[field.key] ? (
              <FieldError>{errors[field.key]}</FieldError>
            ) : (
              field.help_text && <FieldHint>{field.help_text}</FieldHint>
            )}
          </div>
        );
      })}

      <div className="flex justify-end gap-2.5 border-t border-line pt-4">
        <Link href={cancelHref}>
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : pitchId ? "Save changes" : "Submit pitch"}
        </Button>
      </div>
    </form>
  );
}
