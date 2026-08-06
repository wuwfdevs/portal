import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { CONTENT_TYPE_LABEL } from "@/lib/log/content-library";
import { listPrograms } from "@/lib/log/queries";
import { createContentItem } from "../../library-actions";

export default async function NewContentItemPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const programs = await listPrograms();

  return (
    <div className="max-w-2xl">
      <Link href="/log/library" className="text-xs font-semibold text-brand-link">
        ← Back to library
      </Link>
      <h2 className="mt-2 mb-4 font-serif text-xl font-bold text-ink-900">New content item</h2>

      {error && <Alert className="mb-4">{error}</Alert>}

      <form action={createContentItem} className="flex flex-col gap-4 rounded border border-line p-5">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" required maxLength={200} />
        </div>
        <div>
          <Label htmlFor="content_type">Content type</Label>
          <Select id="content_type" name="content_type" defaultValue="news">
            {Object.entries(CONTENT_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="summary">Summary</Label>
          <Textarea id="summary" name="summary" rows={2} />
        </div>
        <div>
          <Label htmlFor="script">Script</Label>
          <Textarea id="script" name="script" rows={5} />
        </div>
        <div className="flex gap-3">
          <div>
            <Label htmlFor="expected_duration_seconds">Expected duration (s)</Label>
            <Input
              id="expected_duration_seconds"
              name="expected_duration_seconds"
              type="number"
              min={1}
              className="w-32"
            />
          </div>
          <div>
            <Label htmlFor="priority">Priority</Label>
            <Input id="priority" name="priority" type="number" className="w-24" />
            <FieldHint>Lower = higher priority. Optional.</FieldHint>
          </div>
        </div>
        <div className="flex gap-3">
          <div>
            <Label htmlFor="effective_from">Effective from</Label>
            <Input id="effective_from" name="effective_from" type="date" />
          </div>
          <div>
            <Label htmlFor="effective_to">Effective to</Label>
            <Input id="effective_to" name="effective_to" type="date" />
          </div>
        </div>
        <div>
          <Label htmlFor="frequency_guidance">Frequency guidance</Label>
          <Input id="frequency_guidance" name="frequency_guidance" maxLength={200} />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" name="reusable" defaultChecked className="h-4 w-4" />
          Reusable (not a one-time item)
        </label>
        {programs.length > 0 && (
          <div>
            <Label>Eligible programs</Label>
            <div className="flex flex-wrap gap-3 text-xs text-ink-700">
              {programs.map((program) => (
                <label key={program.id} className="flex items-center gap-1.5">
                  <input type="checkbox" name="eligible_program_ids" value={program.id} className="h-4 w-4" />
                  {program.name}
                </label>
              ))}
            </div>
            <FieldHint>Leave all unchecked if this item is eligible everywhere.</FieldHint>
          </div>
        )}
        <div>
          <Label htmlFor="geography_tags">Geography tags</Label>
          <Input id="geography_tags" name="geography_tags" placeholder="Pensacola, Escambia County" />
          <FieldHint>Comma-separated.</FieldHint>
        </div>
        <div>
          <Label htmlFor="subject_tags">Subject tags</Label>
          <Input id="subject_tags" name="subject_tags" placeholder="education, local government" />
          <FieldHint>Comma-separated.</FieldHint>
        </div>
        <div>
          <Label htmlFor="community_issue_tags">Community issue tags</Label>
          <Input id="community_issue_tags" name="community_issue_tags" />
          <FieldHint>Comma-separated. Free text for now — see docs/log-design.md §6.</FieldHint>
        </div>
        <div>
          <Label htmlFor="reporter_or_editor">Reporter / editor</Label>
          <Input id="reporter_or_editor" name="reporter_or_editor" maxLength={120} />
          <FieldHint>News items only.</FieldHint>
        </div>
        <div className="flex justify-end border-t border-line pt-4">
          <Button type="submit">Create content item</Button>
        </div>
      </form>
    </div>
  );
}
