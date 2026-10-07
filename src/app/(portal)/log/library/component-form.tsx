import { Button } from "@/components/ui/button";
import { CheckboxField, Field, Input, Select } from "@/components/ui/input";
import { TextLink } from "@/components/ui/primary-link";
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
        <Field label="Type" htmlFor={`component_type-${idSuffix}`}>
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
        </Field>
        <Field label="Sequence" htmlFor={`sequence-${idSuffix}`}>
          <Input
            id={`sequence-${idSuffix}`}
            name="sequence"
            type="number"
            required
            min={1}
            defaultValue={component?.sequence ?? defaultSequence}
          />
        </Field>
        <Field label="Duration (s)" htmlFor={`duration_seconds-${idSuffix}`}>
          <Input
            id={`duration_seconds-${idSuffix}`}
            name="duration_seconds"
            type="number"
            required
            min={1}
            defaultValue={component?.duration_seconds}
          />
        </Field>
      </div>
      <Field label="Script" htmlFor={`component_script-${idSuffix}`}>
        <Input
          id={`component_script-${idSuffix}`}
          name="script"
          defaultValue={component?.script ?? ""}
        />
      </Field>
      <CheckboxField
        name="required"
        defaultChecked={component ? component.required : true}
        label="Required (counts toward total occupied time)"
        className="items-center"
      />
      <div className="flex items-center justify-end gap-3">
        {cancelHref && <TextLink href={cancelHref}>Cancel</TextLink>}
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
