import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { listIndustryCategories, listUnderwriters } from "@/lib/underwriting/queries";
import {
  createIndustryCategory,
  createUnderwriter,
  setIndustryCategoryActive,
} from "../contract-actions";

export default async function UnderwritersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [underwriters, categories] = await Promise.all([
    listUnderwriters(),
    listIndustryCategories(),
  ]);
  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        {error && <Alert className="mb-4">{error}</Alert>}
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
                  <Th>Industry</Th>
                  <Th>Contact</Th>
                </HeaderRow>
              </thead>
              <tbody>
                {underwriters.map((underwriter) => (
                  <Row key={underwriter.id}>
                    <Cell className="font-semibold text-ink-900">
                      <Link
                        href={`/underwriting/underwriters/${underwriter.id}`}
                        className="text-brand-link"
                      >
                        {underwriter.name}
                      </Link>
                    </Cell>
                    <Cell className="text-ink-500">
                      {underwriter.category_id
                        ? (categoryNameById.get(underwriter.category_id) ?? "—")
                        : "—"}
                    </Cell>
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

        {/* Industries ------------------------------------------------------- */}
        <div className="mt-6 rounded border border-line">
          <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
            Industries
          </div>
          <p className="px-5 pt-3 text-xs text-ink-500">
            The typed list the competitive-adjacency rule compares: two underwriters in the same
            industry never run back to back in one break, and a manual placement near one is warned
            about. Deactivate an industry rather than deleting it.
          </p>
          <ul className="divide-y divide-line">
            {categories.map((category) => (
              <li
                key={category.id}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm"
              >
                <span>
                  <span className={category.active ? "text-ink-900" : "text-ink-400"}>
                    {category.name}
                  </span>
                  {category.description && (
                    <span className="ml-2 text-xs text-ink-400">{category.description}</span>
                  )}
                  {!category.active && (
                    <Badge variant="muted" className="ml-2">
                      inactive
                    </Badge>
                  )}
                </span>
                <form action={setIndustryCategoryActive}>
                  <input type="hidden" name="category_id" value={category.id} />
                  <input type="hidden" name="active" value={category.active ? "false" : "true"} />
                  <Button type="submit" variant="ghost">
                    {category.active ? "Deactivate" : "Reactivate"}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
          <form
            action={createIndustryCategory}
            className="flex flex-wrap items-end gap-3 border-t border-line px-5 py-4"
          >
            <div>
              <Label htmlFor="industry_name">New industry</Label>
              <Input id="industry_name" name="name" maxLength={80} placeholder="Veterinary" />
            </div>
            <div className="min-w-[240px] flex-1">
              <Label htmlFor="industry_description">Description</Label>
              <Input id="industry_description" name="description" maxLength={200} />
            </div>
            <Button type="submit" variant="secondary">
              Add industry
            </Button>
          </form>
        </div>
      </div>

      <div className="w-full shrink-0 rounded border border-line lg:w-96">
        <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
          New underwriter
        </div>
        <form action={createUnderwriter} className="flex flex-col gap-4 p-5">
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
            <Label htmlFor="category_id">Industry</Label>
            <Select id="category_id" name="category_id" defaultValue="">
              <option value="">None</option>
              {categories
                .filter((category) => category.active)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </Select>
            <FieldHint>
              Used for the competitive-adjacency rule when scheduling credits. Add a missing
              industry in the list on the left.
            </FieldHint>
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
