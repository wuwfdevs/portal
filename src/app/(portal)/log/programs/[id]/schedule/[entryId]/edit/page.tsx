import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLogProducer } from "@/lib/log/access";
import { getProgram, getScheduleEntry, listClockTemplates } from "@/lib/log/queries";
import { updateScheduleEntry } from "../../../../../program-actions";
import { ScheduleEntryForm } from "../../schedule-entry-form";

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
  const [program, entry, templates] = await Promise.all([
    getProgram(id),
    getScheduleEntry(entryId),
    listClockTemplates(),
  ]);
  if (!program || !entry || entry.program_id !== program.id) notFound();
  const programPath = `/log/programs/${program.id}`;

  return (
    <div>
      <Link href={programPath} className="text-xs font-semibold text-brand-link">
        ← Back to {program.name}
      </Link>
      <h2 className="mt-2 mb-5 font-serif text-xl font-bold text-ink-900">
        Edit schedule entry for {program.name}
      </h2>
      <ScheduleEntryForm
        action={updateScheduleEntry}
        programId={program.id}
        entryId={entry.id}
        entry={entry}
        templates={templates}
        submitLabel="Save changes"
        cancelHref={programPath}
        error={error}
      />
    </div>
  );
}
