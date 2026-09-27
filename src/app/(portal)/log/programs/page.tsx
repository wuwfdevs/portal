import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { InlineCreateCard } from "@/components/ui/inline-create-card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PrimaryLink } from "@/components/ui/primary-link";
import { requireLogAccess } from "@/lib/log/access";
import { listPrograms, listScheduleEntries } from "@/lib/log/queries";
import { createProgram } from "../program-actions";

const PROGRAMS_PATH = "/log/programs";
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The programs list (docs/ui-patterns.md): search and "+ New program" over
 * program cards, each summarizing its schedule and linking to the program's
 * own page, where a producer schedules it. A program is three fields, so it
 * is created inline (`?new=1`); scheduling an entry is a dedicated page
 * under the program.
 */
export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; new?: string; error?: string }>;
}) {
  const { q, new: newParam, error } = await searchParams;
  const { isProducer } = await requireLogAccess();
  const creating = isProducer && newParam === "1";
  const query = (q ?? "").trim().toLowerCase();
  const [programs, scheduleEntries] = await Promise.all([listPrograms(), listScheduleEntries()]);

  const entriesByProgram = new Map<string, typeof scheduleEntries>();
  for (const entry of scheduleEntries) {
    const existing = entriesByProgram.get(entry.program_id);
    if (existing) existing.push(entry);
    else entriesByProgram.set(entry.program_id, [entry]);
  }
  const shown = programs.filter(
    (program) => query === "" || program.name.toLowerCase().includes(query),
  );

  return (
    <div className="flex flex-col gap-4">
      <ListToolbar
        search={{ placeholder: "Search programs", label: "Search programs", defaultValue: q }}
      >
        {isProducer && !creating && (
          <PrimaryLink href={`${PROGRAMS_PATH}?new=1`}>+ New program</PrimaryLink>
        )}
      </ListToolbar>

      {error && !creating && <Alert>{error}</Alert>}

      {creating && (
        <InlineCreateCard
          title="New program"
          action={createProgram}
          submitLabel="Create program"
          cancelHref={PROGRAMS_PATH}
        >
          {error && <Alert className="mb-4">{error}</Alert>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                required
                maxLength={120}
                placeholder="Morning Edition"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="kind">Kind</Label>
              <Select id="kind" name="kind" defaultValue="recurring">
                <option value="recurring">Recurring</option>
                <option value="special">Special</option>
              </Select>
            </div>
          </div>
          <div className="mt-4">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" rows={2} />
          </div>
        </InlineCreateCard>
      )}

      {shown.length === 0 ? (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          {programs.length === 0 ? "No programs yet." : "No programs match."}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {shown.map((program) => (
            <div key={program.id} className="rounded border border-line">
              <div className="flex items-center gap-2.5 border-b border-line px-5 py-3.5">
                <Link
                  href={`${PROGRAMS_PATH}/${program.id}`}
                  className="text-sm font-bold text-brand-link hover:underline"
                >
                  {program.name}
                </Link>
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
                        {entry.air_time} for {entry.duration_minutes}m, {entry.entry_type}
                        {entry.entry_type === "recurring" && entry.days_of_week.length > 0 && (
                          <> ({entry.days_of_week.map((day) => DAY_LABELS[day]).join(", ")})</>
                        )}
                        , from {entry.start_date}
                        {entry.end_date ? ` to ${entry.end_date}` : ""}
                        {entry.notes && <span className="block text-ink-400">{entry.notes}</span>}
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
  );
}
