import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { listUnderwriters } from "@/lib/underwriting/queries";
import { createUnderwriter } from "../contract-actions";

export default async function UnderwritersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const underwriters = await listUnderwriters();

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        {underwriters.length === 0 ? (
          <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
            No underwriters yet.
          </div>
        ) : (
          <TableFrame>
            <Table>
              <thead>
                <HeaderRow>
                  <Th>Name</Th>
                  <Th>Category</Th>
                  <Th>Contact</Th>
                </HeaderRow>
              </thead>
              <tbody>
                {underwriters.map((underwriter) => (
                  <Row key={underwriter.id}>
                    <Cell className="font-semibold text-ink-900">
                      <Link href={`/underwriting/underwriters/${underwriter.id}`} className="text-brand-link">
                        {underwriter.name}
                      </Link>
                    </Cell>
                    <Cell className="text-ink-500">{underwriter.category ?? "—"}</Cell>
                    <Cell className="text-ink-500">
                      {underwriter.contact_name ?? "—"}
                      {underwriter.email ? ` · ${underwriter.email}` : ""}
                    </Cell>
                  </Row>
                ))}
              </tbody>
            </Table>
          </TableFrame>
        )}
      </div>

      <div className="w-full shrink-0 rounded border border-line lg:w-96">
        <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">New underwriter</div>
        <form action={createUnderwriter} className="flex flex-col gap-4 p-5">
          {error && <Alert>{error}</Alert>}
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required maxLength={200} />
          </div>
          <div>
            <Label htmlFor="mailing_address">Mailing address</Label>
            <Textarea id="mailing_address" name="mailing_address" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="contact_name">Contact name</Label>
              <Input id="contact_name" name="contact_name" maxLength={200} />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" maxLength={40} />
            </div>
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" />
          </div>
          <div>
            <Label htmlFor="category">Category</Label>
            <Input id="category" name="category" placeholder="e.g. Real Estate Services" />
            <FieldHint>Used for the competitive-adjacency advisory when scheduling credits.</FieldHint>
          </div>
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={3} />
          </div>
          <div className="flex justify-end border-t border-line pt-4">
            <Button type="submit">Create underwriter</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
