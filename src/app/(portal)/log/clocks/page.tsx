import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { InlineCreateCard } from "@/components/ui/inline-create-card";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/input";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PrimaryLink } from "@/components/ui/primary-link";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireLogAccess } from "@/lib/log/access";
import { listClockTemplates } from "@/lib/log/queries";
import { createClockTemplate } from "../clock-actions";

const CLOCKS_PATH = "/log/clocks";

/** The clock templates list (docs/ui-patterns.md): a template is two fields, so a producer creates one inline (`?new=1`); versions and slots are added on its own page. */
export default async function ClockTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; new?: string; error?: string }>;
}) {
  const { q, new: newParam, error } = await searchParams;
  const { isProducer } = await requireLogAccess();
  const creating = isProducer && newParam === "1";
  const query = (q ?? "").trim().toLowerCase();
  const templates = await listClockTemplates();
  const shown = templates.filter(
    (template) =>
      query === "" ||
      template.name.toLowerCase().includes(query) ||
      (template.description ?? "").toLowerCase().includes(query),
  );

  return (
    <div className="flex flex-col gap-4">
      <ListToolbar
        search={{ placeholder: "Search clocks", label: "Search clock templates", defaultValue: q }}
      >
        {isProducer && !creating && (
          <PrimaryLink href={`${CLOCKS_PATH}?new=1`}>+ New clock template</PrimaryLink>
        )}
      </ListToolbar>

      {error && !creating && <Alert>{error}</Alert>}

      {creating && (
        <InlineCreateCard
          title="New clock template"
          action={createClockTemplate}
          submitLabel="Create template"
          cancelHref={CLOCKS_PATH}
        >
          {error && <Alert className="mb-4">{error}</Alert>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[280px_minmax(0,1fr)]">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                required
                maxLength={120}
                placeholder="Weekday Morning Drive"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" rows={2} />
              <FieldHint>Add versions once the template exists — see its detail page.</FieldHint>
            </div>
          </div>
        </InlineCreateCard>
      )}

      {shown.length === 0 ? (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          {templates.length === 0 ? "No clock templates yet." : "No clock templates match."}
        </div>
      ) : (
        <TableFrame>
          <Table>
            <thead>
              <HeaderRow>
                <Th>Name</Th>
                <Th>Description</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {shown.map((template) => (
                <Row key={template.id}>
                  <Cell>
                    <Link
                      href={`${CLOCKS_PATH}/${template.id}`}
                      className="font-bold text-brand-link"
                    >
                      {template.name}
                    </Link>
                  </Cell>
                  <Cell className="text-ink-500">{template.description ?? "—"}</Cell>
                </Row>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      )}
    </div>
  );
}
