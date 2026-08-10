import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { COMPONENT_TYPE_LABEL } from "@/lib/log/content-library";
import type { LogContentComponentRow } from "@/lib/log/queries";

/**
 * A content item component's field set, shared by "Add a component" and the
 * component list's in-place "Edit" form.
 */
export function ComponentForm({
  action,
  contentItemId,
  component,
  defaultSequence,
  submitLabel,
  cancelHref,
}: {
  action: (formData: FormData) => void;
  contentItemId: string;
  /** Omit for a new component; pass the existing row to prefill an edit. */
  component?: LogContentComponentRow;
  defaultSequence?: number;
  submitLabel: string;
  cancelHref?: string;
}) {
  const idSuffix = component?.id ?? "new";
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="content_item_id" value={contentItemId} />
      {component && <input type="hidden" name="component_id" value={component.id} />}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor={`component_type-${idSuffix}`}>Type</Label>
          <Select
            id={`component_type-${idSuffix}`}
            name="component_type"
            defaultValue={component?.component_type ?? "recorded_audio"}
          >
            {Object.entries(COMPONENT_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={`sequence-${idSuffix}`}>Sequence</Label>
          <Input
            id={`sequence-${idSuffix}`}
            name="sequence"
            type="number"
            required
            min={1}
            defaultValue={component?.sequence ?? defaultSequence}
          />
        </div>
        <div>
          <Label htmlFor={`duration_seconds-${idSuffix}`}>Duration (s)</Label>
          <Input
            id={`duration_seconds-${idSuffix}`}
            name="duration_seconds"
            type="number"
            required
            min={1}
            defaultValue={component?.duration_seconds}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`component_script-${idSuffix}`}>Script</Label>
          <Input id={`component_script-${idSuffix}`} name="script" defaultValue={component?.script ?? ""} />
        </div>
        <div>
          <Label htmlFor={`component_dad_cart_number-${idSuffix}`}>ENCO/DAD cart</Label>
          <Input
            id={`component_dad_cart_number-${idSuffix}`}
            name="dad_cart_number"
            placeholder="e.g. 4021"
            defaultValue={component?.dad_cart_number ?? ""}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-700">
        <input
          type="checkbox"
          name="required"
          defaultChecked={component ? component.required : true}
          className="h-4 w-4"
        />
        Required (counts toward total occupied time)
      </label>
      <div className="flex items-center justify-end gap-3">
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
