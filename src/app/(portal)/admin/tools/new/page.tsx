import { SecondaryLink } from "@/components/ui/primary-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Field, Input } from "@/components/ui/input";
import { createProposedTool } from "../actions";

/**
 * The only screen that creates a `tools` row outside a migration, and it can
 * only create a proposed one — a tool that exists as an idea so a Roadmap post
 * has something to target. Real registry rows still come from a migration
 * alongside the code that implements them. See docs/roadmap-design.md §6.
 */
export default async function NewProposedToolPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="max-w-lg">
      <PageHeader
        className="mb-5"
        back={{ href: "/admin/tools", label: "Back to tools" }}
        title="New proposed tool"
        description="A proposal is a registry row for something nobody has built. It stays off the dashboard, cannot be granted to anyone, and exists so requests on the Roadmap can point at it and be counted together. Change its status here once it is really being built."
      />
      <Card>
        <form action={createProposedTool} className="flex flex-col gap-4 p-5">
          {error && <Alert>{error}</Alert>}
          <Field label="Name" htmlFor="name">
            <Input id="name" name="name" required placeholder="Newsletter Builder" />
          </Field>
          <Field
            label="Key"
            htmlFor="key"
            hint="Lowercase letters, numbers, and hyphens. Permanent — it is the identifier authorization keys off if this ever becomes a real tool."
          >
            <Input
              id="key"
              name="key"
              required
              placeholder="newsletter-builder"
              pattern="[a-z0-9][a-z0-9\-]*"
            />
          </Field>
          <Field label="Description" htmlFor="description">
            <Input
              id="description"
              name="description"
              required
              placeholder="What it would do, in a sentence."
            />
          </Field>
          <Field
            label="Sort order"
            htmlFor="sort_order"
            hint="Only affects ordering in lists. Proposals sit after real tools by default."
          >
            <Input id="sort_order" name="sort_order" type="number" defaultValue={99} />
          </Field>
          <div className="flex justify-end gap-2.5 border-t border-line pt-4">
            <SecondaryLink href="/admin/tools">Cancel</SecondaryLink>
            <Button type="submit">Create proposal</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
