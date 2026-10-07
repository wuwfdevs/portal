import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireProgramDirector } from "@/lib/log/access";
import { getProgram, listClockTemplates, listScheduleEntries } from "@/lib/log/queries";
import { stationTodayISO } from "@/lib/log/timezone";
import { toOverlapOther } from "../to-overlap-other";
import { createScheduleEntry } from "../../../../program-actions";
import { ScheduleEditor } from "../schedule-editor";

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
  searchParams: Promise<{ error?: string; clock?: string }>;
}) {
  const { id } = await params;
  const { error, clock } = await searchParams;
  await requireProgramDirector();
  const [program, templates, allEntries] = await Promise.all([
    getProgram(id),
    listClockTemplates(),
    listScheduleEntries(),
  ]);
  if (!program) notFound();
  const programPath = `/log/programs/${program.id}`;

  return (
    <div>
      <PageHeader
        as="h2"
        back={{ href: programPath, label: `Back to ${program.name}` }}
        title={`Add a time for ${program.name}`}
        className="mb-5"
      />
      {templates.length === 0 ? (
        <p className="text-sm text-ink-500">
          Create a{" "}
          <Link
            href={`/log/clocks/new?from=${program.id}`}
            className="font-semibold text-brand-link"
          >
            clock template
          </Link>{" "}
          first — a schedule entry needs one.
        </p>
      ) : (
        <ScheduleEditor
          action={createScheduleEntry}
          programId={program.id}
          templates={templates.map((template) => ({ id: template.id, name: template.name }))}
          others={allEntries.map(toOverlapOther)}
          todayISO={stationTodayISO()}
          defaultClockId={templates.some((template) => template.id === clock) ? clock : undefined}
          submitLabel="Add to schedule"
          cancelHref={programPath}
          error={error}
        />
      )}
    </div>
  );
}
