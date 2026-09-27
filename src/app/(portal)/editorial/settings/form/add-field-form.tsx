"use client";

import { useState } from "react";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { FIELD_TYPE_LABEL } from "@/lib/editorial/form";
import type { EpFieldType } from "@/lib/database.types";

/**
 * The fields of the "Add a field" inline card. A client component purely so
 * the options box appears only for the field types that have options — the
 * surrounding <form action={createFormField}> is the server-rendered
 * InlineCreateCard on the settings page.
 */
export function AddFieldFields() {
  const [fieldType, setFieldType] = useState<EpFieldType>("short_text");
  const takesOptions = fieldType === "select" || fieldType === "multi_select";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="label">Label</Label>
          <Input
            id="label"
            name="label"
            required
            maxLength={120}
            placeholder="e.g. Why now?"
            autoFocus
          />
          <FieldHint>
            Writers see this above the input. Its key is generated from the label.
          </FieldHint>
        </div>
        <div>
          <Label htmlFor="field_type">Type</Label>
          <Select
            id="field_type"
            name="field_type"
            value={fieldType}
            onChange={(event) => setFieldType(event.target.value as EpFieldType)}
          >
            {Object.entries(FIELD_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <FieldHint>Type is fixed once the field exists.</FieldHint>
        </div>
      </div>

      {takesOptions && (
        <div>
          <Label htmlFor="options">Options</Label>
          <Textarea
            id="options"
            name="options"
            rows={4}
            placeholder={"Feature\nInterview\nSeries"}
          />
          <FieldHint>One option per line.</FieldHint>
        </div>
      )}

      <div>
        <Label htmlFor="help_text">Help text</Label>
        <Input id="help_text" name="help_text" maxLength={200} />
      </div>

      <label className="flex items-center gap-2 text-sm text-ink-700">
        <input type="checkbox" name="required" className="h-4 w-4" />
        Required
      </label>
    </div>
  );
}
