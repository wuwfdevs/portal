import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SecondaryLink } from "@/components/ui/primary-link";
import { RichTextField } from "@/components/ui/rich-text-field";
import { requireRoadmapAccess } from "@/lib/roadmap/access";
import { listTargetTools } from "@/lib/roadmap/queries";
import { POST_KIND_LABEL } from "@/lib/roadmap/posts";
import type { RdPostKind } from "@/lib/database.types";
import { createPost } from "../actions";

const KINDS: RdPostKind[] = ["improvement", "feature", "bug", "new_tool"];

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireRoadmapAccess();
  const { error } = await searchParams;
  const tools = await listTargetTools();
  const existing = tools.filter((tool) => !tool.proposed);
  const proposed = tools.filter((tool) => tool.proposed);

  return (
    <div className="max-w-2xl">
      <PageHeader
        className="mb-5"
        back={{ href: "/roadmap", label: "Back to the roadmap" }}
        title="New request"
      />
      <Card>
        <form action={createPost} className="flex flex-col gap-4 p-5">
          {error && <Alert>{error}</Alert>}

          <Field label="Title" htmlFor="title">
            <Input
              id="title"
              name="title"
              required
              maxLength={160}
              placeholder="One sentence: what should be different?"
            />
          </Field>

          <Field label="Kind" htmlFor="kind">
            <Select id="kind" name="kind" defaultValue="improvement">
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {POST_KIND_LABEL[kind]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="What is it about?" htmlFor="tool_id">
            <Select id="tool_id" name="tool_id" defaultValue="">
              <option value="">Nothing in particular / the portal itself</option>
              <optgroup label="Tools">
                {existing.map((tool) => (
                  <option key={tool.id} value={tool.id}>
                    {tool.name}
                  </option>
                ))}
              </optgroup>
              {proposed.length > 0 && (
                <optgroup label="Proposed — not built yet">
                  {proposed.map((tool) => (
                    <option key={tool.id} value={tool.id}>
                      {tool.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          </Field>

          <Field
            label="Or, a tool that doesn't exist yet"
            htmlFor="proposed_tool_name"
            hint="Only used for a whole-new-tool request with nothing above to point at. An administrator can turn the name into a real proposal later, so other requests can gather under it."
          >
            <Input
              id="proposed_tool_name"
              name="proposed_tool_name"
              placeholder="Newsletter Builder"
            />
          </Field>

          <Field
            label="Description"
            htmlFor="body"
            hint="What you are trying to do, what gets in the way, and what would be good enough. A concrete example beats a general principle."
          >
            <RichTextField name="body" ariaLabel="Request description" />
          </Field>

          <div className="flex justify-end gap-2.5 border-t border-line pt-4">
            <SecondaryLink href="/roadmap">Cancel</SecondaryLink>
            <Button type="submit">File request</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
