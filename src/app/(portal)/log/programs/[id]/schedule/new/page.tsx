import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DayPicker } from "@/components/ui/day-picker";
import { FieldHint, Input, Label, Select } from "@/components/ui/input";
import { requireLogProducer } from "@/lib/log/access";
import { getProgram, listClockTemplates } from "@/lib/log/queries";
import { createScheduleEntry } from "../../../../program-actions";

/**
 * Scheduling a program is a dedicated page under the program
 * (docs/ui-patterns.md rule 2 — eight fields), producer-only, rather than
 * the side form the programs list used to carry.
 */
export default async function NewScheduleEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  await requireLogProducer();
  const [program, templates] = await Promise.all([getProgram(id), listClockTemplates()]);
  if (!program) notFound();
  const programPath = `/log/programs/${program.id}`;

  return (
    <div>
      <Link href={programPath} className="text-xs font-semibold text-brand-link">
        ← Back to {program.name}
      </Link>
      <h2 className="mt-2 mb-5 font-serif text-xl font-bold text-ink-900">
        Schedule {program.name}
      </h2>
      {templates.length === 0 ? (
        <p className="text-sm text-ink-500">
          Create a{" "}
          <Link href="/log/clocks" className="font-semibold text-brand-link">
            clock template
          </Link>{" "}
          first — a schedule entry needs one.
        </p>
      ) : (
        <form action={createScheduleEntry} className="flex w-full max-w-2xl flex-col gap-5">
          {error && <Alert>{error}</Alert>}
          <input type="hidden" name="program_id" value={program.id} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="clock_template_id">Clock template</Label>
              <Select
                id="clock_template_id"
                name="clock_template_id"
                required
                defaultValue={templates[0]?.id}
                autoFocus
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="entry_type">Entry type</Label>
              <Select id="entry_type" name="entry_type" defaultValue="recurring">
                <option value="recurring">Recurring</option>
                <option value="override">Override</option>
                <option value="holiday">Holiday</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>Days of week</Label>
            <DayPicker name="days_of_week" />
            <FieldHint>Only used for a recurring entry.</FieldHint>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="start_date">Start date</Label>
              <Input id="start_date" name="start_date" type="date" required />
            </div>
            <div>
              <Label htmlFor="end_date">End date</Label>
              <Input id="end_date" name="end_date" type="date" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="air_time">Air time</Label>
              <Input id="air_time" name="air_time" type="time" required />
            </div>
            <div>
              <Label htmlFor="duration_minutes">Duration (min)</Label>
              <Input id="duration_minutes" name="duration_minutes" type="number" required min={1} />
              <FieldHint>May span multiple hours — the clock template repeats each hour.</FieldHint>
            </div>
          </div>
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" name="notes" maxLength={240} />
          </div>
          <div className="flex items-center gap-4 border-t border-line pt-5">
            <Button type="submit">Add to schedule</Button>
            <Link
              href={programPath}
              className="px-1 text-sm font-bold text-brand-link hover:underline"
            >
              Cancel
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
