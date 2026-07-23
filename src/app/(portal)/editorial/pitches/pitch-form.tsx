"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError, FieldHint } from "@/components/ui/input";
import { savePitch, type PitchFormState } from "./actions";
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

  const inputClass =
    "w-full rounded border border-line px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 " +
    "focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-surface";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {pitchId && <input type="hidden" name="pitch_id" value={pitchId} />}
      {state.status === "error" && state.message && (
        <p className="rounded border border-danger/30 bg-danger/[0.06] px-3 py-2 text-xs text-danger">
          {state.message}
        </p>
      )}

      <div>
        <Label htmlFor="title">Title *</Label>
        <Input id="title" name="title" defaultValue={title} maxLength={200} required />
        {errors.title && <FieldError>{errors.title}</FieldError>}
      </div>

      {fields.map((field) => {
        const name = `field_${field.key}`;
        const value = values[field.key];
        const text = Array.isArray(value) ? "" : (value ?? "");
        const selected = Array.isArray(value) ? value : value ? [value] : [];
        const label = field.required ? `${field.label} *` : field.label;

        return (
          <div key={field.id}>
            <Label htmlFor={name}>{label}</Label>
            {field.field_type === "long_text" ? (
              <textarea id={name} name={name} defaultValue={text} rows={4} className={inputClass} />
            ) : field.field_type === "select" ? (
              <select id={name} name={name} defaultValue={text} className={inputClass}>
                <option value="">Choose…</option>
                {(field.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : field.field_type === "multi_select" ? (
              <div className="flex flex-col gap-1.5 pt-0.5">
                {(field.options ?? []).map((option) => (
                  <label key={option} className="flex items-center gap-2 text-sm text-ink-900">
                    <input
                      type="checkbox"
                      name={name}
                      value={option}
                      defaultChecked={selected.includes(option)}
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
