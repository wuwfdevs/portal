import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLogProducer } from "@/lib/log/access";
import {
  getProgram,
  getScheduleEntry,
  listClockTemplates,
  listScheduleEntries,
} from "@/lib/log/queries";
import { stationTodayISO } from "@/lib/log/timezone";
import { updateScheduleEntry } from "../../../../../program-actions";
import { ScheduleEditor } from "../../schedule-editor";
import { toOverlapOther } from "../../to-overlap-other";

/**
 * Editing a schedule entry — also where "Change clock" leads. The create form
 * with this entry's values filled in (docs/ui-patterns.md, rule 3), producer-only.
 */
export default async function EditScheduleEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; entryId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id, entryId } = await params;
  const { error } = await searchParams;
  await requireLogProducer();
  const [program, entry, templates, allEntries] = await Promise.all([
    getProgram(id),
    getScheduleEntry(entryId),
    listClockTemplates(),
    listScheduleEntries(),
  ]);
  if (!program || !entry || entry.program_id !== program.id) notFound();
  const programPath = `/log/programs/${program.id}`;

  return (
    <div>
      <Link href={programPath} className="text-xs font-semibold text-brand-link">
        ← Back to {program.name}
      </Link>
      <h2 className="mt-2 font-serif text-xl font-bold text-ink-900">Edit schedule</h2>
      <p className="mt-1 mb-5 text-sm text-ink-500">
        Change when {program.name} airs. The preview on the right updates as you go.
      </p>
      <ScheduleEditor
        action={updateScheduleEntry}
        programId={program.id}
        entryId={entry.id}
        entry={entry}
        templates={templates.map((template) => ({ id: template.id, name: template.name }))}
        others={allEntries.map(toOverlapOther)}
        todayISO={stationTodayISO()}
        submitLabel="Save schedule"
        cancelHref={programPath}
        error={error}
      />
    </div>
  );
}
