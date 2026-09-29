import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DayPicker } from "@/components/ui/day-picker";
import { FieldHint, Input, Label, Select } from "@/components/ui/input";
import type { LogClockTemplateRow, LogScheduleRow } from "@/lib/log/queries";

/**
 * The schedule-entry fields, shared by "+ Schedule" (new) and "Edit entry" /
 * "Change clock" (edit) so the two can't drift: the edit page is the create
 * form with the entry's own values filled in (docs/ui-patterns.md, rule 3).
 */
export function ScheduleEntryForm({
  action,
  programId,
  entryId,
  templates,
  entry,
  defaultClockId,
  submitLabel,
  cancelHref,
  error,
}: {
  action: (formData: FormData) => Promise<void>;
  programId: string;
  /** Present when editing; carried as a hidden field. */
  entryId?: string;
  templates: LogClockTemplateRow[];
  /** The entry being edited; absent for a new one. */
  entry?: LogScheduleRow;
  /** Preselected clock for a new entry ("Schedule a program with this clock"). */
  defaultClockId?: string;
  submitLabel: string;
  cancelHref: string;
  error?: string;
}) {
  const clockId = entry?.clock_template_id ?? defaultClockId ?? templates[0]?.id;
  return (
    <form action={action} className="flex w-full max-w-2xl flex-col gap-5">
      {error && <Alert>{error}</Alert>}
      <input type="hidden" name="program_id" value={programId} />
      {entryId && <input type="hidden" name="entry_id" value={entryId} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="clock_template_id">Clock template</Label>
          <Select
            id="clock_template_id"
            name="clock_template_id"
            required
            defaultValue={clockId}
            autoFocus
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </Select>
          {!entry && (
            <FieldHint>
              Not listed?{" "}
              <Link
                href={`/log/clocks/new?from=${programId}`}
                className="font-semibold text-brand-link hover:underline"
              >
                Create a clock for this program
              </Link>
              .
            </FieldHint>
          )}
          {entry && (
            <FieldHint>
              Rundowns already generated keep the clock they were built from; the new clock applies
              to rundowns generated from now on.
            </FieldHint>
          )}
        </div>
        <div>
          <Label htmlFor="entry_type">Entry type</Label>
          <Select id="entry_type" name="entry_type" defaultValue={entry?.entry_type ?? "recurring"}>
            <option value="recurring">Recurring</option>
            <option value="override">Override</option>
            <option value="holiday">Holiday</option>
          </Select>
        </div>
      </div>
      <div>
        <Label>Days of week</Label>
        <DayPicker name="days_of_week" defaultValue={entry?.days_of_week} />
        <FieldHint>Only used for a recurring entry.</FieldHint>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="start_date">Start date</Label>
          <Input
            id="start_date"
            name="start_date"
            type="date"
            required
            defaultValue={entry?.start_date}
          />
        </div>
        <div>
          <Label htmlFor="end_date">End date</Label>
          <Input
            id="end_date"
            name="end_date"
            type="date"
            defaultValue={entry?.end_date ?? undefined}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="air_time">Air time</Label>
          <Input
            id="air_time"
            name="air_time"
            type="time"
            required
            defaultValue={entry?.air_time.slice(0, 5)}
          />
        </div>
        <div>
          <Label htmlFor="duration_minutes">Duration (min)</Label>
          <Input
            id="duration_minutes"
            name="duration_minutes"
            type="number"
            required
            min={1}
            defaultValue={entry?.duration_minutes}
          />
          <FieldHint>May span multiple hours — the clock template repeats each hour.</FieldHint>
        </div>
      </div>
      <div>
        <Label htmlFor="notes">Notes</Label>
        <Input id="notes" name="notes" maxLength={240} defaultValue={entry?.notes ?? undefined} />
      </div>
      <div className="flex items-center gap-4 border-t border-line pt-5">
        <Button type="submit">{submitLabel}</Button>
        <Link href={cancelHref} className="px-1 text-sm font-bold text-brand-link hover:underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
