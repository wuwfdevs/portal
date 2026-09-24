import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { CONTENT_TYPE_LABEL } from "@/lib/log/content-library";
import type { LogContentItemRow } from "@/lib/log/queries";

/**
 * The content item field set, shared by the "new content item" page and the
 * library detail page's in-place "Edit" form — the same fields either way,
 * only the action and whether values start blank or prefilled differ.
 */
export function ContentItemForm({
  action,
  submitLabel,
  item,
  cancelHref,
}: {
  action: (formData: FormData) => void;
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
          <Label htmlFor="effective_from">Effective from</Label>
          <Input id="effective_from" name="effective_from" type="date" defaultValue={item?.effective_from ?? ""} />
        </div>
        <div>
          <Label htmlFor="effective_to">Effective to</Label>
          <Input id="effective_to" name="effective_to" type="date" defaultValue={item?.effective_to ?? ""} />
        </div>
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
