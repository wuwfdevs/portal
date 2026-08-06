import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { requireLogAccess } from "@/lib/log/access";
import { listClockTemplates, listPrograms, listScheduleEntries } from "@/lib/log/queries";
import { createProgram, createScheduleEntry } from "../program-actions";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { isProducer } = await requireLogAccess();
  const [programs, templates, scheduleEntries] = await Promise.all([
    listPrograms(),
    listClockTemplates(),
    listScheduleEntries(),
  ]);

  const entriesByProgram = new Map<string, typeof scheduleEntries>();
  for (const entry of scheduleEntries) {
    const existing = entriesByProgram.get(entry.program_id);
    if (existing) existing.push(entry);
    else entriesByProgram.set(entry.program_id, [entry]);
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        {error && (
          <Alert className="mb-4">{error}</Alert>
        )}
        {programs.length === 0 ? (
          <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
            No programs yet.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {programs.map((program) => (
              <div key={program.id} className="rounded border border-line">
                <div className="flex items-center gap-2.5 border-b border-line px-5 py-3.5">
                  <span className="text-sm font-bold text-ink-900">{program.name}</span>
                  <Badge variant={program.kind === "special" ? "warning" : "neutral"}>
                    {program.kind}
                  </Badge>
                </div>
                {program.description && (
                  <p className="px-5 pt-3 text-sm text-ink-500">{program.description}</p>
                )}
                <div className="px-5 py-3">
                  {(entriesByProgram.get(program.id) ?? []).length === 0 ? (
                    <p className="text-xs text-ink-400">Not scheduled yet.</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5 text-xs text-ink-700">
                      {(entriesByProgram.get(program.id) ?? []).map((entry) => (
                        <li key={entry.id}>
                          <span className="font-semibold">{entry.clockTemplateName}</span> —{" "}
                          {entry.entry_type}
                          {entry.entry_type === "recurring" && entry.days_of_week.length > 0 && (
                            <> ({entry.days_of_week.map((day) => DAY_LABELS[day]).join(", ")})</>
                          )}
                          , from {entry.start_date}
                          {entry.end_date ? ` to ${entry.end_date}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isProducer && (
        <div className="flex w-full shrink-0 flex-col gap-6 lg:w-96">
          <div className="rounded border border-line">
            <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
              New program
            </div>
            <form action={createProgram} className="flex flex-col gap-4 p-5">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required maxLength={120} placeholder="Morning Edition" />
              </div>
              <div>
                <Label htmlFor="kind">Kind</Label>
                <Select id="kind" name="kind" defaultValue="recurring">
                  <option value="recurring">Recurring</option>
                  <option value="special">Special</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" name="description" rows={2} />
              </div>
              <div className="flex justify-end border-t border-line pt-4">
                <Button type="submit">Create program</Button>
              </div>
            </form>
          </div>

          <div className="rounded border border-line">
            <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
              Schedule a program
            </div>
            {programs.length === 0 || templates.length === 0 ? (
              <p className="px-5 py-4 text-xs text-ink-500">
                Create at least one program and one clock template first.
              </p>
            ) : (
              <form action={createScheduleEntry} className="flex flex-col gap-4 p-5">
                {error && <Alert>{error}</Alert>}
                <div>
                  <Label htmlFor="program_id">Program</Label>
                  <Select id="program_id" name="program_id" required defaultValue={programs[0]?.id}>
                    {programs.map((program) => (
                      <option key={program.id} value={program.id}>
                        {program.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="clock_template_id">Clock template</Label>
                  <Select
                    id="clock_template_id"
                    name="clock_template_id"
                    required
                    defaultValue={templates[0]?.id}
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
                <div>
                  <Label>Days of week</Label>
                  <div className="flex flex-wrap gap-3 text-xs text-ink-700">
                    {DAY_LABELS.map((label, day) => (
                      <label key={day} className="flex items-center gap-1.5">
                        <input type="checkbox" name="days_of_week" value={day} className="h-4 w-4" />
                        {label}
                      </label>
                    ))}
                  </div>
                  <FieldHint>Only used for a recurring entry.</FieldHint>
                </div>
                <div className="flex gap-3">
                  <div>
                    <Label htmlFor="start_date">Start date</Label>
                    <Input id="start_date" name="start_date" type="date" required />
                  </div>
                  <div>
                    <Label htmlFor="end_date">End date</Label>
                    <Input id="end_date" name="end_date" type="date" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Input id="notes" name="notes" maxLength={240} />
                </div>
                <div className="flex justify-end border-t border-line pt-4">
                  <Button type="submit">Add to schedule</Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
