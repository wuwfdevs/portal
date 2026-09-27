import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DetailSummary } from "@/components/ui/detail-summary";
import { requireLogAccess } from "@/lib/log/access";
import { getProgram, listClockTemplates, listScheduleEntriesForProgram } from "@/lib/log/queries";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * A program's own page: its schedule entries, with "+ Schedule" for a
 * producer, and a read-only summary in the right column (docs/ui-patterns.md
 * rule 5). There is no edit path for a program yet — none existed before
 * this page either; the NPR mapping columns are set by migration.
 */
export default async function ProgramDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error, saved } = await searchParams;
  const { isProducer } = await requireLogAccess();
  const [program, entries, templates] = await Promise.all([
    getProgram(id),
    listScheduleEntriesForProgram(id),
    listClockTemplates(),
  ]);
  if (!program) notFound();
  const templateNameById = new Map(templates.map((template) => [template.id, template.name]));

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <Link href="/log/programs" className="text-xs font-semibold text-brand-link">
          ← Back to programs
        </Link>
        <div className="mt-2 mb-4 flex flex-wrap items-center gap-2.5">
          <h2 className="font-serif text-xl font-bold text-ink-900">{program.name}</h2>
          <Badge variant={program.kind === "special" ? "warning" : "neutral"}>{program.kind}</Badge>
          {saved === "scheduled" && <Badge variant="success">Scheduled</Badge>}
        </div>

        {error && <Alert className="mb-4">{error}</Alert>}

        <div className="rounded border border-line">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <span className="text-sm font-bold text-ink-900">Schedule</span>
            {isProducer && (
              <Link
                href={`/log/programs/${program.id}/schedule/new`}
                className="text-sm font-bold text-brand-link hover:underline"
              >
                + Schedule
              </Link>
            )}
          </div>
          {entries.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-500">Not scheduled yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {entries.map((entry) => (
                <li key={entry.id} className="px-5 py-3 text-sm">
                  <div className="text-ink-900">
                    <span className="font-semibold">
                      {templateNameById.get(entry.clock_template_id) ?? "Unknown clock"}
                    </span>{" "}
                    — {entry.air_time.slice(0, 5)} for {entry.duration_minutes}m
                  </div>
                  <div className="mt-0.5 text-xs text-ink-500">
                    {entry.entry_type}
                    {entry.entry_type === "recurring" && entry.days_of_week.length > 0 && (
                      <> ({entry.days_of_week.map((day) => DAY_LABELS[day]).join(", ")})</>
                    )}
                    , from {entry.start_date}
                    {entry.end_date ? ` to ${entry.end_date}` : ""}
                  </div>
                  {entry.notes && <div className="mt-0.5 text-xs text-ink-400">{entry.notes}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <aside aria-label="Program details" className="w-full shrink-0 lg:w-80">
        <DetailSummary
          title="Details"
          items={[
            { label: "Kind", value: program.kind },
            { label: "Description", value: program.description, preserveLines: true },
            { label: "NPR collection", value: program.npr_collection_id?.toString() ?? null },
            {
              label: "Feed start (ET)",
              value:
                program.npr_feed_start_hour_et === null
                  ? null
                  : `${program.npr_feed_start_hour_et}:00`,
            },
          ]}
        />
      </aside>
    </div>
  );
}
