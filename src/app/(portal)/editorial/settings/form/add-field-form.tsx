"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { createFormField } from "../actions";
import type { EpFieldType } from "@/lib/database.types";

export const FIELD_TYPE_LABEL: Record<EpFieldType, string> = {
  short_text: "Short text",
  long_text: "Long text",
  select: "Select (one)",
  multi_select: "Select (several)",
  date: "Date",
  url: "Link",
};

/**
 * Client component purely so the options box appears only for the field types
 * that have options — everything else is a plain server action form.
 */
export function AddFieldForm({ error }: { error?: string }) {
  const [fieldType, setFieldType] = useState<EpFieldType>("short_text");
  const takesOptions = fieldType === "select" || fieldType === "multi_select";

  return (
    <form action={createFormField} className="flex flex-col gap-4 p-5">
      {error && <Alert>{error}</Alert>}

      <div>
        <Label htmlFor="label">Label</Label>
        <Input id="label" name="label" required maxLength={120} placeholder="e.g. Why now?" />
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

      <div className="flex justify-end border-t border-line pt-4">
        <Button type="submit">Add field</Button>
      </div>
    </form>
  );
}
