import type { FormFieldRow, PitchValueRow } from "@/lib/editorial/data";

/**
 * Renders a pitch's dynamic field values in form order. Takes the full field
 * list (including deactivated fields) so historical pitches always render the
 * fields they were submitted with.
 */
export function PitchValues({
  fields,
  values,
}: {
  fields: FormFieldRow[];
  values: PitchValueRow[];
}) {
  const valueByFieldId = new Map(values.map((row) => [row.field_id, row.value]));
  const withValues = fields.filter((field) => valueByFieldId.has(field.id));

  if (withValues.length === 0) {
    return <p className="text-sm text-ink-400">No details were provided.</p>;
  }

  return (
    <dl className="flex flex-col gap-3.5">
      {withValues.map((field) => {
        const value = valueByFieldId.get(field.id) as string | string[];
        return (
          <div key={field.id}>
            <dt className="text-xs font-semibold text-ink-500">{field.label}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-900">
              {Array.isArray(value) ? value.join(", ") : value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
