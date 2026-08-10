import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { CONTENT_TYPE_LABEL } from "@/lib/log/content-library";
import type { LogContentItemRow, LogProgramRow } from "@/lib/log/queries";

/**
 * The content item field set, shared by the "new content item" page and the
 * library detail page's in-place "Edit" form — the same fields either way,
 * only the action and whether values start blank or prefilled differ.
 */
export function ContentItemForm({
  action,
  programs,
  submitLabel,
  item,
  cancelHref,
}: {
  action: (formData: FormData) => void;
  programs: LogProgramRow[];
  submitLabel: string;
  /** Omit for a new item; pass the existing row to prefill an edit. */
  item?: LogContentItemRow;
  cancelHref?: string;
}) {
  return (
    <form action={action} className="flex flex-col gap-4 rounded border border-line p-5">
      {item && <input type="hidden" name="content_item_id" value={item.id} />}
      <div>
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required maxLength={200} defaultValue={item?.title ?? ""} />
      </div>
      <div>
        <Label htmlFor="content_type">Content type</Label>
        <Select id="content_type" name="content_type" defaultValue={item?.content_type ?? "news"}>
          {Object.entries(CONTENT_TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="summary">Summary</Label>
        <Textarea id="summary" name="summary" rows={2} defaultValue={item?.summary ?? ""} />
      </div>
      <div>
        <Label htmlFor="script">Script</Label>
        <Textarea id="script" name="script" rows={5} defaultValue={item?.script ?? ""} />
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
            defaultValue={item?.expected_duration_seconds ?? ""}
          />
        </div>
        <div>
          <Label htmlFor="priority">Priority</Label>
          <Input id="priority" name="priority" type="number" className="w-24" defaultValue={item?.priority ?? ""} />
          <FieldHint>Lower = higher priority. Optional.</FieldHint>
        </div>
      </div>
      <div className="flex gap-3">
        <div>
          <Label htmlFor="effective_from">Effective from</Label>
          <Input id="effective_from" name="effective_from" type="date" defaultValue={item?.effective_from ?? ""} />
        </div>
        <div>
          <Label htmlFor="effective_to">Effective to</Label>
          <Input id="effective_to" name="effective_to" type="date" defaultValue={item?.effective_to ?? ""} />
        </div>
      </div>
      <div>
        <Label htmlFor="frequency_guidance">Frequency guidance</Label>
        <Input
          id="frequency_guidance"
          name="frequency_guidance"
          maxLength={200}
          defaultValue={item?.frequency_guidance ?? ""}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-700">
        <input type="checkbox" name="reusable" defaultChecked={item ? item.reusable : true} className="h-4 w-4" />
        Reusable (not a one-time item)
      </label>
      {programs.length > 0 && (
        <div>
          <Label>Eligible programs</Label>
          <div className="flex flex-wrap gap-3 text-xs text-ink-700">
            {programs.map((program) => (
              <label key={program.id} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  name="eligible_program_ids"
                  value={program.id}
                  defaultChecked={item?.eligible_program_ids.includes(program.id) ?? false}
                  className="h-4 w-4"
                />
                {program.name}
              </label>
            ))}
          </div>
          <FieldHint>Leave all unchecked if this item is eligible everywhere.</FieldHint>
        </div>
      )}
      <div>
        <Label htmlFor="geography_tags">Geography tags</Label>
        <Input
          id="geography_tags"
          name="geography_tags"
          placeholder="Pensacola, Escambia County"
          defaultValue={item?.geography_tags.join(", ") ?? ""}
        />
        <FieldHint>Comma-separated.</FieldHint>
      </div>
      <div>
        <Label htmlFor="subject_tags">Subject tags</Label>
        <Input
          id="subject_tags"
          name="subject_tags"
          placeholder="education, local government"
          defaultValue={item?.subject_tags.join(", ") ?? ""}
        />
        <FieldHint>Comma-separated.</FieldHint>
      </div>
      <div>
        <Label htmlFor="community_issue_tags">Community issue tags</Label>
        <Input
          id="community_issue_tags"
          name="community_issue_tags"
          defaultValue={item?.community_issue_tags.join(", ") ?? ""}
        />
        <FieldHint>Comma-separated. Free text for now — see docs/log-design.md §6.</FieldHint>
      </div>
      <div>
        <Label htmlFor="reporter_or_editor">Reporter / editor</Label>
        <Input
          id="reporter_or_editor"
          name="reporter_or_editor"
          maxLength={120}
          defaultValue={item?.reporter_or_editor ?? ""}
        />
        <FieldHint>News items only.</FieldHint>
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
        {cancelHref && (
          <Link href={cancelHref} className="text-xs font-semibold text-ink-500 hover:underline">
            Cancel
          </Link>
        )}
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
