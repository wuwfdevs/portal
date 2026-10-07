import { listFormFields } from "@/lib/editorial/data";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineCreateCard } from "@/components/ui/inline-create-card";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PrimaryLink, TextLink } from "@/components/ui/primary-link";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { ReorderButtons } from "@/components/editorial/reorder-buttons";
import { FIELD_TYPE_LABEL, PRIMARY_PILLAR_FIELD_KEY } from "@/lib/editorial/form";
import { createFormField, moveFormField, toggleFormFieldActive } from "../actions";
import { AddFieldFields } from "./add-field-form";
import type { FormFieldRow } from "@/lib/editorial/data";

const FORM_PATH = "/editorial/settings/form";
type FieldView = "active" | "retired";

/** The pitch form's fields (docs/ui-patterns.md): an Active/Retired filter and "+ Add field", which opens an inline card since a field is a handful of fields itself. */
export default async function FormSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; view?: string; new?: string }>;
}) {
  const { error, view: viewParam, new: newParam } = await searchParams;
  const view: FieldView = viewParam === "retired" ? "retired" : "active";
  const creating = newParam === "1";
  const allFields = await listFormFields();
  const activeCount = allFields.filter((field) => field.active).length;
  const retiredCount = allFields.length - activeCount;
  const fields = allFields.filter((field) => (view === "active" ? field.active : !field.active));

  return (
    <div className="flex flex-col gap-4">
      <ListToolbar
        chipsLabel="Show fields"
        chips={[
          { label: "Active", count: activeCount, href: FORM_PATH, active: view === "active" },
          {
            label: "Retired",
            count: retiredCount,
            href: `${FORM_PATH}?view=retired`,
            active: view === "retired",
          },
        ]}
      >
        {!creating && <PrimaryLink href={`${FORM_PATH}?new=1`}>+ Add field</PrimaryLink>}
      </ListToolbar>

      {error && !creating && <Alert>{error}</Alert>}

      {creating && (
        <InlineCreateCard
          title="Add a field"
          action={createFormField}
          submitLabel="Add field"
          cancelHref={FORM_PATH}
        >
          {error && <Alert className="mb-4">{error}</Alert>}
          <AddFieldFields />
        </InlineCreateCard>
      )}

      <div>
        <h2 className="mb-2.5 text-sm font-bold text-ink-900">Fields on the pitch form</h2>
        <TableFrame>
          <Table stack className="md:min-w-[680px]">
            <thead>
              <HeaderRow>
                <Th>Field</Th>
                <Th>Type</Th>
                <Th>Required</Th>
                {view === "active" && <Th>Order</Th>}
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </HeaderRow>
            </thead>
            <tbody>
              {view === "active" && (
                <Row className="hover:bg-transparent">
                  <Cell stack="title">
                    <div className="font-semibold text-ink-900">Title</div>
                    <div className="text-xs text-ink-400">Every pitch needs a title.</div>
                  </Cell>
                  <Cell label="Type" className="text-ink-500">
                    Short text
                  </Cell>
                  <Cell label="Required" className="text-ink-500">
                    Yes
                  </Cell>
                  <Cell stack="aside" colSpan={2}>
                    <Badge variant="neutral">Built in</Badge>
                  </Cell>
                </Row>
              )}

              {fields.map((field, index) => (
                <FieldRow
                  key={field.id}
                  field={field}
                  view={view}
                  isFirst={index === 0}
                  isLast={index === fields.length - 1}
                />
              ))}
            </tbody>
          </Table>
        </TableFrame>

        {fields.length === 0 && (
          <p className="mt-3 text-sm text-ink-500">
            {view === "active"
              ? "The form is just a title right now. Add a field to start collecting more."
              : "No retired fields — retiring a field here tucks it out of the way without deleting it or the pitches that used it."}
          </p>
        )}
      </div>
    </div>
  );
}

function FieldRow({
  field,
  view,
  isFirst,
  isLast,
}: {
  field: FormFieldRow;
  view: FieldView;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <Row className={field.active ? undefined : "bg-panel-50/40"}>
      <Cell stack="title">
        <div className="font-semibold text-ink-900">{field.label}</div>
        {field.key === PRIMARY_PILLAR_FIELD_KEY ? (
          <div className="mt-0.5 text-xs leading-snug text-ink-400">
            Picklist and guidance managed in{" "}
            <TextLink href="/editorial/settings/pillars" className="px-0 text-xs font-normal">
              Settings → Pillars
            </TextLink>
            .
          </div>
        ) : (
          <>
            {field.help_text && (
              <div className="mt-0.5 text-xs leading-snug text-ink-400">{field.help_text}</div>
            )}
            {field.options && field.options.length > 0 && (
              <div className="mt-1 text-xs text-ink-400">Options: {field.options.join(" · ")}</div>
            )}
          </>
        )}
        <code className="mt-1 block font-mono text-[11px] text-ink-400">{field.key}</code>
      </Cell>
      <Cell label="Type" className="text-ink-500">
        {FIELD_TYPE_LABEL[field.field_type]}
      </Cell>
      <Cell label="Required" className="text-ink-500">
        {field.required ? "Yes" : "No"}
      </Cell>
      {view === "active" && (
        <Cell stack="full">
          <ReorderButtons
            action={moveFormField}
            idName="field_id"
            id={field.id}
            label={field.label}
            isFirst={isFirst}
            isLast={isLast}
          />
        </Cell>
      )}
      <Cell stack="full">
        <div className="flex items-center gap-3 whitespace-nowrap">
          <TextLink
            href={`/editorial/settings/form/${field.id}/edit`}
            className="px-0 text-xs font-semibold"
          >
            Edit
          </TextLink>
          <form action={toggleFormFieldActive}>
            <input type="hidden" name="field_id" value={field.id} />
            <input type="hidden" name="next_active" value={(!field.active).toString()} />
            <Button type="submit" variant="link">
              {field.active ? "Retire" : "Restore"}
            </Button>
          </form>
        </div>
      </Cell>
    </Row>
  );
}
