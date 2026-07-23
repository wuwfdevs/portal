import Link from "next/link";
import { listFormFields } from "@/lib/editorial/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldHint } from "@/components/ui/input";
import { createFormField, moveFormField, toggleFormFieldActive } from "../actions";
import type { EpFieldType } from "@/lib/database.types";

const FIELD_TYPE_LABEL: Record<EpFieldType, string> = {
  short_text: "Short text",
  long_text: "Long text",
  select: "Select",
  multi_select: "Multi-select",
  date: "Date",
  url: "Link",
};

export default async function FormSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const fields = await listFormFields();

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 overflow-x-auto rounded border border-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line bg-panel-50 text-left text-[11px] font-bold uppercase tracking-wide text-ink-500">
              <th className="px-4 py-2.5">Field</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Required</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Order</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line">
              <td className="px-4 py-3 font-semibold text-ink-900">Title</td>
              <td className="px-4 py-3 text-ink-500">Short text</td>
              <td className="px-4 py-3 text-ink-500">Yes</td>
              <td className="px-4 py-3 text-xs text-ink-400" colSpan={3}>
                Built in — every pitch needs a title
              </td>
            </tr>
            {fields.map((field, index) => (
              <tr key={field.id} className="border-b border-line last:border-b-0">
                <td className="px-4 py-3">
                  <div className="font-semibold text-ink-900">{field.label}</div>
                  {field.help_text && <div className="text-xs text-ink-400">{field.help_text}</div>}
                </td>
                <td className="px-4 py-3 text-ink-500">{FIELD_TYPE_LABEL[field.field_type]}</td>
                <td className="px-4 py-3 text-ink-500">{field.required ? "Yes" : "No"}</td>
                <td className="px-4 py-3">
                  {field.active ? (
                    <Badge variant="accent">Active</Badge>
                  ) : (
                    <Badge variant="muted">Inactive</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <form action={moveFormField}>
                      <input type="hidden" name="field_id" value={field.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button
                        type="submit"
                        disabled={index === 0}
                        aria-label={`Move ${field.label} up`}
                        className="px-1 text-ink-500 disabled:text-ink-400/40"
                      >
                        ↑
                      </button>
                    </form>
                    <form action={moveFormField}>
                      <input type="hidden" name="field_id" value={field.id} />
                      <input type="hidden" name="direction" value="down" />
                      <button
                        type="submit"
                        disabled={index === fields.length - 1}
                        aria-label={`Move ${field.label} down`}
                        className="px-1 text-ink-500 disabled:text-ink-400/40"
                      >
                        ↓
                      </button>
                    </form>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/editorial/settings/form/${field.id}/edit`}
                      className="text-xs font-semibold text-brand-link"
                    >
                      Edit
                    </Link>
                    <form action={toggleFormFieldActive}>
                      <input type="hidden" name="field_id" value={field.id} />
                      <input type="hidden" name="next_active" value={(!field.active).toString()} />
                      <button
                        type="submit"
                        className="text-xs font-semibold text-ink-500 hover:underline"
                      >
                        {field.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="w-full rounded border border-line lg:w-80">
        <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
          Add a field
        </div>
        <form action={createFormField} className="flex flex-col gap-3.5 p-5">
          {error && <p className="text-xs text-danger">{error}</p>}
          <div>
            <Label htmlFor="label">Label</Label>
            <Input id="label" name="label" required />
          </div>
          <div>
            <Label htmlFor="field_type">Type</Label>
            <select
              id="field_type"
              name="field_type"
              className="w-full rounded border border-line px-3 py-2.5 text-sm text-ink-900"
            >
              {Object.entries(FIELD_TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="options">Options</Label>
            <textarea
              id="options"
              name="options"
              rows={3}
              className="w-full rounded border border-line px-3 py-2 text-sm text-ink-900"
            />
            <FieldHint>For select fields: one option per line.</FieldHint>
          </div>
          <div>
            <Label htmlFor="help_text">Help text</Label>
            <Input id="help_text" name="help_text" />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" name="required" />
            Required
          </label>
          <div className="flex justify-end border-t border-line pt-3.5">
            <Button type="submit">Add field</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
