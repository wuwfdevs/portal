import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { TextLink } from "@/components/ui/primary-link";
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
  initial,
}: {
  action: (formData: FormData) => void;
  submitLabel: string;
  /** Omit for a new item; pass the existing row to prefill an edit. */
  item?: LogContentItemRow;
  cancelHref?: string;
  /** Starting values for a NEW item, e.g. from a hand-off link; an existing `item` wins. */
  initial?: { title?: string; content_type?: string; summary?: string };
}) {
  return (
    <form action={action} className="flex flex-col gap-4 rounded border border-line p-5">
      {item && <input type="hidden" name="content_item_id" value={item.id} />}
      <Field label="Title" htmlFor="title">
        <Input
          id="title"
          name="title"
          required
          maxLength={200}
          defaultValue={item?.title ?? initial?.title ?? ""}
        />
      </Field>
      <Field label="Content type" htmlFor="content_type">
        <Select
          id="content_type"
          name="content_type"
          defaultValue={item?.content_type ?? initial?.content_type ?? "news"}
        >
          {Object.entries(CONTENT_TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Summary" htmlFor="summary">
        <Textarea
          id="summary"
          name="summary"
          rows={initial?.summary ? 6 : 2}
          defaultValue={item?.summary ?? initial?.summary ?? ""}
        />
      </Field>
      <Field label="Script" htmlFor="script">
        <Textarea id="script" name="script" rows={5} defaultValue={item?.script ?? ""} />
      </Field>
      <div className="flex gap-3">
        <Field label="Expected duration (s)" htmlFor="expected_duration_seconds">
          <Input
            id="expected_duration_seconds"
            name="expected_duration_seconds"
            type="number"
            min={1}
            className="w-32"
            defaultValue={item?.expected_duration_seconds ?? ""}
          />
        </Field>
        <Field label="Effective from" htmlFor="effective_from">
          <Input
            id="effective_from"
            name="effective_from"
            type="date"
            defaultValue={item?.effective_from ?? ""}
          />
        </Field>
        <Field label="Effective to" htmlFor="effective_to">
          <Input
            id="effective_to"
            name="effective_to"
            type="date"
            defaultValue={item?.effective_to ?? ""}
          />
        </Field>
      </div>
      <Field
        label="Community issue tags"
        htmlFor="community_issue_tags"
        hint="Comma-separated. Free text for now — see docs/log-design.md §6."
      >
        <Input
          id="community_issue_tags"
          name="community_issue_tags"
          defaultValue={item?.community_issue_tags.join(", ") ?? ""}
        />
      </Field>
      <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
        {cancelHref && <TextLink href={cancelHref}>Cancel</TextLink>}
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
