import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireLogAccess } from "@/lib/log/access";
import { listClockTemplates } from "@/lib/log/queries";
import { createClockTemplate } from "../clock-actions";

export default async function ClockTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { isProducer } = await requireLogAccess();
  const templates = await listClockTemplates();

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        {templates.length === 0 ? (
          <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
            No clock templates yet.
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
                {templates.map((template) => (
                  <Row key={template.id}>
                    <Cell className="font-semibold text-ink-900">
                      <Link href={`/log/clocks/${template.id}`} className="text-brand-link">
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

      {isProducer && (
        <div className="w-full shrink-0 rounded border border-line lg:w-80">
          <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
            New clock template
          </div>
          <form action={createClockTemplate} className="flex flex-col gap-4 p-5">
            {error && <Alert>{error}</Alert>}
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required maxLength={120} placeholder="Weekday Morning Drive" />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" rows={3} />
              <FieldHint>Add versions once the template exists — see its detail page.</FieldHint>
            </div>
            <div className="flex justify-end border-t border-line pt-4">
              <Button type="submit">Create template</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
