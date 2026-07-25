import Link from "next/link";
import { listFormFields } from "@/lib/editorial/data";
import { Badge } from "@/components/ui/badge";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { ReorderButtons } from "@/components/editorial/reorder-buttons";
import { moveFormField, toggleFormFieldActive } from "../actions";
import { AddFieldForm, FIELD_TYPE_LABEL } from "./add-field-form";

export default async function FormSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const fields = await listFormFields();
  const activeCount = fields.filter((field) => field.active).length;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <div className="mb-2.5 flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-bold text-ink-900">Fields on the pitch form</h2>
          <span className="text-xs text-ink-400">
            {activeCount} active
            {fields.length > activeCount && ` · ${fields.length - activeCount} retired`}
          </span>
        </div>

        <TableFrame>
          <Table className="min-w-[680px]">
            <thead>
              <HeaderRow>
                <Th>Field</Th>
                <Th>Type</Th>
                <Th>Required</Th>
                <Th>Status</Th>
                <Th>Order</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </HeaderRow>
            </thead>
            <tbody>
              <Row className="hover:bg-transparent">
                <Cell>
                  <div className="font-semibold text-ink-900">Title</div>
                  <div className="text-xs text-ink-400">Every pitch needs a title.</div>
                </Cell>
                <Cell className="text-ink-500">Short text</Cell>
                <Cell className="text-ink-500">Yes</Cell>
                <Cell colSpan={3}>
                  <Badge variant="neutral">Built in</Badge>
                </Cell>
              </Row>

              {fields.map((field, index) => (
                <Row key={field.id} className={field.active ? undefined : "bg-panel-50/40"}>
                  <Cell>
                    <div className="font-semibold text-ink-900">{field.label}</div>
                    {field.help_text && (
                      <div className="mt-0.5 text-xs leading-snug text-ink-400">
                        {field.help_text}
                      </div>
                    )}
                    {field.options && field.options.length > 0 && (
                      <div className="mt-1 text-xs text-ink-400">
                        Options: {field.options.join(" · ")}
                      </div>
                    )}
                    <code className="mt-1 block font-mono text-[11px] text-ink-400">
                      {field.key}
                    </code>
                  </Cell>
                  <Cell className="text-ink-500">{FIELD_TYPE_LABEL[field.field_type]}</Cell>
                  <Cell className="text-ink-500">{field.required ? "Yes" : "No"}</Cell>
                  <Cell>
                    {field.active ? (
                      <Badge variant="accent">Active</Badge>
                    ) : (
                      <Badge variant="muted">Retired</Badge>
                    )}
                  </Cell>
                  <Cell>
                    <ReorderButtons
                      action={moveFormField}
                      idName="field_id"
                      id={field.id}
                      label={field.label}
                      isFirst={index === 0}
                      isLast={index === fields.length - 1}
                    />
                  </Cell>
                  <Cell>
                    <div className="flex items-center gap-3 whitespace-nowrap">
                      <Link
                        href={`/editorial/settings/form/${field.id}/edit`}
                        className="text-xs font-semibold text-brand-link hover:underline"
                      >
                        Edit
                      </Link>
                      <form action={toggleFormFieldActive}>
                        <input type="hidden" name="field_id" value={field.id} />
                        <input
                          type="hidden"
                          name="next_active"
                          value={(!field.active).toString()}
                        />
                        <button
                          type="submit"
                          className="rounded text-xs font-semibold text-ink-500 hover:text-ink-900 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-surface"
                        >
                          {field.active ? "Retire" : "Restore"}
                        </button>
                      </form>
                    </div>
                  </Cell>
                </Row>
              ))}
            </tbody>
          </Table>
        </TableFrame>

        {fields.length === 0 && (
          <p className="mt-3 text-sm text-ink-500">
            The form is just a title right now. Add a field to start collecting more.
          </p>
        )}
      </div>

      <div className="w-full shrink-0 rounded border border-line lg:w-80">
        <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
          Add a field
        </div>
        <AddFieldForm error={error} />
      </div>
    </div>
  );
}
