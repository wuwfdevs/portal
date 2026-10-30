"use client";

import { useState } from "react";
import { CheckboxField, Field, Input, Select, Textarea } from "@/components/ui/input";
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
        <Field
          label="Label"
          htmlFor="label"
          hint="Writers see this above the input. Its key is generated from the label."
        >
          <Input
            id="label"
            name="label"
            required
            maxLength={120}
            placeholder="e.g. Why now?"
            autoFocus
          />
        </Field>
        <Field label="Type" htmlFor="field_type" hint="Type is fixed once the field exists.">
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
        </Field>
      </div>

      {takesOptions && (
        <Field label="Options" htmlFor="options" hint="One option per line.">
          <Textarea
            id="options"
            name="options"
            rows={4}
            placeholder={"Feature\nInterview\nSeries"}
          />
        </Field>
      )}

      <Field label="Help text" htmlFor="help_text">
        <Input id="help_text" name="help_text" maxLength={200} />
      </Field>

      <CheckboxField name="required" label="Required" />
    </div>
  );
}
