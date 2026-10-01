import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { PrimaryLink } from "@/components/ui/primary-link";
import { listIndustryCategories } from "@/lib/underwriting/queries";
import { createIndustryCategory, setIndustryCategoryActive } from "../../contract-actions";

const INDUSTRIES_PATH = "/underwriting/setup/industries";

/**
 * The industry lookup, on its own view rather than sharing the underwriters
 * list (docs/ui-patterns.md rule 4). An industry is two fields, so it is
 * created inline: "+ New industry" opens the first row of the list as the
 * form (`?new=1`), Cancel closes it.
 */
export default async function IndustriesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; error?: string }>;
}) {
  const { new: newParam, error } = await searchParams;
  const creating = newParam === "1";
  const categories = await listIndustryCategories();

  return (
    <div>
      <Link href="/underwriting/setup" className="text-xs font-semibold text-brand-link">
        ← Setup
      </Link>
      <div className="mt-2 mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-xl font-bold text-ink-900">Industries</h2>
        {!creating && <PrimaryLink href={`${INDUSTRIES_PATH}?new=1`}>+ New industry</PrimaryLink>}
      </div>
      <p className="mb-4 max-w-[720px] text-[13px] text-ink-500">
        The typed list the competitive-adjacency rule compares: two underwriters in the same
        industry never run back to back in one break, and a manual placement near one is warned
        about. Deactivate an industry rather than deleting it.
      </p>

      <div className="rounded border border-line">
        {creating && (
          <form
            action={createIndustryCategory}
            className="border-b border-line bg-panel-50 px-5 py-4"
          >
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-[220px]">
                <Label htmlFor="industry_name">Name</Label>
                <Input
                  id="industry_name"
                  name="name"
                  required
                  maxLength={80}
                  placeholder="Veterinary"
                  autoFocus
                />
              </div>
              <div className="min-w-[240px] flex-1">
                <Label htmlFor="industry_description">Description</Label>
                <Input id="industry_description" name="description" maxLength={200} />
              </div>
              <Button type="submit">Add industry</Button>
              <Link
                href={INDUSTRIES_PATH}
                className="px-1 py-2.5 text-sm font-bold text-brand-link hover:underline"
              >
                Cancel
              </Link>
            </div>
            {error && <FieldError>{error}</FieldError>}
          </form>
        )}
        {!creating && error && (
          <div className="border-b border-line px-5 py-3">
            <FieldError>{error}</FieldError>
          </div>
        )}
        {categories.length === 0 && !creating ? (
          <p className="px-5 py-4 text-sm text-ink-500">No industries yet.</p>
        ) : (
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
        )}
      </div>
    </div>
  );
}
