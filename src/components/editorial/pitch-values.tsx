import type { FormFieldRow, PitchValueRow } from "@/lib/editorial/data";

function renderValue(value: string | string[]): string {
  return Array.isArray(value) ? value.join(", ") : value;
}

/**
 * The submission form's fields that this pitch actually answered, in form
 * order. Exported so a caller that shows the first answer up front and hides
 * the rest behind a disclosure (the meeting scoring screen) can tell whether
 * there is anything left to disclose.
 */
export function fieldsWithValues(fields: FormFieldRow[], values: PitchValueRow[]): FormFieldRow[] {
  const answered = new Set(values.map((row) => row.field_id));
  return fields.filter((field) => answered.has(field.id));
}

/**
 * Renders a pitch's dynamic field values in form order. Takes the full field
 * list (including deactivated fields) so historical pitches always render the
 * fields they were submitted with.
 *
 * `slice` splits that list where a screen only wants part of it: "lead" is the
 * first answer alone, rendered as plain body copy (its label is redundant when
 * it is the only thing showing), and "rest" is everything after it.
 */
export function PitchValues({
  fields,
  values,
  slice = "all",
}: {
  fields: FormFieldRow[];
  values: PitchValueRow[];
  slice?: "all" | "lead" | "rest";
}) {
  const valueByFieldId = new Map(values.map((row) => [row.field_id, row.value]));
  const withValues = fieldsWithValues(fields, values);

  if (slice === "lead") {
    const lead = withValues[0];
    if (!lead) return <p className="text-sm text-ink-400">No details were provided.</p>;
    return (
      <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-900">
        {renderValue(valueByFieldId.get(lead.id) as string | string[])}
      </p>
    );
  }

  const shown = slice === "rest" ? withValues.slice(1) : withValues;
  if (shown.length === 0) {
    return slice === "rest" ? null : (
      <p className="text-sm text-ink-400">No details were provided.</p>
    );
  }

  return (
    <dl className="flex flex-col gap-5">
      {shown.map((field) => (
        <div key={field.id}>
          <dt className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
            {field.label}
          </dt>
          <dd className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-900">
            {renderValue(valueByFieldId.get(field.id) as string | string[])}
          </dd>
        </div>
      ))}
    </dl>
  );
}
