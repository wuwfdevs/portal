import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { FieldHint, Input, Label } from "@/components/ui/input";
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
      <div className="mb-5">
        <Link href="/admin/tools" className="text-xs font-semibold text-brand-link">
          ← Back to tools
        </Link>
      </div>
      <div className="rounded border border-line">
        <div className="border-b border-line px-5 py-4">
          <h1 className="font-serif text-[17px] font-bold text-ink-900">New proposed tool</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-500">
            A proposal is a registry row for something nobody has built. It stays off the dashboard,
            cannot be granted to anyone, and exists so requests on the Roadmap can point at it and
            be counted together. Change its status here once it is really being built.
          </p>
        </div>
        <form action={createProposedTool} className="flex flex-col gap-4 p-5">
          {error && <Alert>{error}</Alert>}
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required placeholder="Newsletter Builder" />
          </div>
          <div>
            <Label htmlFor="key">Key</Label>
            <Input
              id="key"
              name="key"
              required
              placeholder="newsletter-builder"
              pattern="[a-z0-9][a-z0-9\-]*"
            />
            <FieldHint>
              Lowercase letters, numbers, and hyphens. Permanent — it is the identifier
              authorization keys off if this ever becomes a real tool.
            </FieldHint>
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              name="description"
              required
              placeholder="What it would do, in a sentence."
            />
          </div>
          <div>
            <Label htmlFor="sort_order">Sort order</Label>
            <Input id="sort_order" name="sort_order" type="number" defaultValue={99} />
            <FieldHint>
              Only affects ordering in lists. Proposals sit after real tools by default.
            </FieldHint>
          </div>
          <div className="flex justify-end gap-2.5 border-t border-line pt-4">
            <Link href="/admin/tools">
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Link>
            <Button type="submit">Create proposal</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
