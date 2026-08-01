import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select } from "@/components/ui/input";
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
      <div className="mb-5">
        <Link href="/roadmap" className="text-xs font-semibold text-brand-link">
          ← Back to the roadmap
        </Link>
      </div>
      <div className="rounded border border-line">
        <div className="border-b border-line px-5 py-4 font-serif text-[17px] font-bold text-ink-900">
          New request
        </div>
        <form action={createPost} className="flex flex-col gap-4 p-5">
          {error && <Alert>{error}</Alert>}

          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              required
              maxLength={160}
              placeholder="One sentence: what should be different?"
            />
          </div>

          <div>
            <Label htmlFor="kind">Kind</Label>
            <Select id="kind" name="kind" defaultValue="improvement">
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {POST_KIND_LABEL[kind]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="tool_id">What is it about?</Label>
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
          </div>

          <div>
            <Label htmlFor="proposed_tool_name">Or, a tool that doesn&apos;t exist yet</Label>
            <Input
              id="proposed_tool_name"
              name="proposed_tool_name"
              placeholder="Newsletter Builder"
            />
            <FieldHint>
              Only used for a whole-new-tool request with nothing above to point at. An
              administrator can turn the name into a real proposal later, so other requests can
              gather under it.
            </FieldHint>
          </div>

          <div>
            <Label htmlFor="body">Description</Label>
            <RichTextField name="body" ariaLabel="Request description" />
            <FieldHint>
              What you are trying to do, what gets in the way, and what would be good enough. A
              concrete example beats a general principle.
            </FieldHint>
          </div>

          <div className="flex justify-end gap-2.5 border-t border-line pt-4">
            <Link href="/roadmap">
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Link>
            <Button type="submit">File request</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
