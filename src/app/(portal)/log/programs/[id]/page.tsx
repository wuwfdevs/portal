import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DetailSummary } from "@/components/ui/detail-summary";
import { ClockThumb } from "@/components/log/clock-thumb";
import { requireLogAccess } from "@/lib/log/access";
import {
  buildWeekStrip,
  CLOCK_VARIANT_LABEL,
  deriveProgramStatus,
  formatDateShort,
  describeDaysOfWeek,
  formatLengthLong,
  formatTimeRange,
  isPlaceholderClockName,
  nextAiringDate,
  STATUS_LABEL,
} from "@/lib/log/program-status";
import { formatAirTime } from "@/lib/log/schedule";
import { effectiveDays } from "@/lib/log/schedule-overlap";
import { stationTodayISO } from "@/lib/log/timezone";
import {
  getProgram,
  listClockSummaries,
  listClockTemplates,
  listScheduleEntries,
  listScheduleEntriesForProgram,
} from "@/lib/log/queries";
import { cn } from "@/lib/cn";

const STATUS_VARIANT = {
  on_real_clock: "success",
  needs_clock: "warning",
  not_scheduled: "neutral",
} as const;

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];
/** Mon..Sun, as the day pills and the editor lay them out. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const SAVED_MESSAGE: Record<string, string> = {
  scheduled: "Scheduled",
  entry: "Entry saved",
  program: "Program saved",
};

/**
 * A program's own page, schedule first ("When it airs"): each entry as a card
 * with its days, time range and an Edit button, and below it the clock it runs
 * on (a face, the version in effect, links to open or change it); then what the
 * week looks like, and —
 * for a program still on the shared placeholder clock — a callout saying what
 * that costs and how to fix it. Producers get Edit / Change clock on each
 * entry, "Edit schedule" (only with exactly one live entry), "+ Add a time",
 * and Edit program; everyone else reads. The NPR
 * mapping columns in the right column are set by migration.
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
  const today = stationTodayISO();
  const [program, entries, templates, summaries, allEntries] = await Promise.all([
    getProgram(id),
    listScheduleEntriesForProgram(id),
    listClockTemplates(),
    listClockSummaries(today),
    listScheduleEntries(),
  ]);
  if (!program) notFound();

  const templateNameById = new Map(templates.map((template) => [template.id, template.name]));
  const programsByTemplate = new Map<string, Set<string>>();
  for (const entry of allEntries) {
    const set = programsByTemplate.get(entry.clock_template_id);
    if (set) set.add(entry.program_id);
    else programsByTemplate.set(entry.clock_template_id, new Set([entry.program_id]));
  }

  const named = entries.map((entry) => ({
    ...entry,
    clockTemplateName: templateNameById.get(entry.clock_template_id) ?? "Unknown clock",
  }));
  const status = deriveProgramStatus(named, today);
  const live = named.filter((entry) => entry.end_date === null || entry.end_date >= today);
  const ended = named.filter((entry) => entry.end_date !== null && entry.end_date < today);
  const week = buildWeekStrip(live, today);
  const placeholderEntries = live.filter((entry) =>
    isPlaceholderClockName(entry.clockTemplateName),
  );

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <div>
          <Link href="/log/programs" className="text-xs font-semibold text-brand-link">
            ← Programs
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <h2 className="font-serif text-xl font-bold text-ink-900">{program.name}</h2>
            <Badge variant={program.kind === "special" ? "warning" : "neutral"}>
              {program.kind}
            </Badge>
            <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
            {saved && SAVED_MESSAGE[saved] && (
              <Badge variant="success">{SAVED_MESSAGE[saved]}</Badge>
            )}
            {isProducer && (
              <div className="ml-auto flex flex-wrap gap-2">
                {live.length === 1 && (
                  <Link
                    href={`/log/programs/${program.id}/schedule/${live[0]!.id}/edit`}
                    className="inline-flex h-10 items-center rounded bg-brand-primary px-4 text-sm font-bold text-white hover:bg-[#2278B8]"
                  >
                    Edit schedule
                  </Link>
                )}
                <Link
                  href={`/log/programs/${program.id}/schedule/new`}
                  className="inline-flex h-10 items-center rounded border border-brand-link px-4 text-sm font-bold text-brand-link hover:bg-brand-surface"
                >
                  + Add a time
                </Link>
              </div>
            )}
          </div>
        </div>

        {error && <Alert>{error}</Alert>}

        {placeholderEntries.length > 0 && (
          <div
            role="note"
            className="flex flex-col gap-4 rounded border border-warning-fg/30 bg-warning-bg p-5 sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-warning-fg">Awaiting a network clock</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-700">
                This program uses the shared placeholder clock, one slot spanning the whole hour.
                Rundowns can still be generated, but there is no network structure and no local
                opportunity to fill until it has a real clock.
              </p>
            </div>
            {isProducer && (
              <div className="flex shrink-0 flex-col gap-2">
                <Link
                  href={`/log/programs/${program.id}/schedule/${placeholderEntries[0]!.id}/edit`}
                  className="inline-flex items-center justify-center rounded bg-brand-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-[#2278B8]"
                >
                  Choose a clock
                </Link>
                <Link
                  href={`/log/clocks/new?from=${program.id}`}
                  className="inline-flex items-center justify-center rounded border border-brand-link bg-white px-4 py-2.5 text-sm font-bold text-brand-link hover:bg-brand-surface"
                >
                  Create a clock for this program
                </Link>
              </div>
            )}
          </div>
        )}

        <section aria-labelledby="schedule-heading" className="flex flex-col gap-3">
          <h3 id="schedule-heading" className="text-base font-bold text-ink-900">
            When it airs
          </h3>
          {named.length === 0 ? (
            <p className="rounded border border-line px-5 py-4 text-sm text-ink-500">
              Not scheduled yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {[...live, ...ended].map((entry) => {
                const summary = summaries.get(entry.clock_template_id);
                const placeholder = isPlaceholderClockName(entry.clockTemplateName);
                const isEnded = entry.end_date !== null && entry.end_date < today;
                const next = isEnded ? null : nextAiringDate(entry, today);
                const sharedBy = programsByTemplate.get(entry.clock_template_id)?.size ?? 0;
                const airingDays = effectiveDays(entry);
                const editHref = `/log/programs/${program.id}/schedule/${entry.id}/edit`;
                const clockHref = `/log/clocks/${entry.clock_template_id}?from=${program.id}`;
                const summaryParts = [
                  entry.entry_type === "recurring"
                    ? describeDaysOfWeek(entry.days_of_week)
                    : entry.entry_type === "override"
                      ? "Override"
                      : "Holiday",
                  formatLengthLong(entry.duration_minutes),
                  `from ${formatDateShort(entry.start_date)}`,
                ];
                if (entry.end_date && !isEnded)
                  summaryParts.push(`to ${formatDateShort(entry.end_date)}`);
                if (next) summaryParts.push(`next airing ${formatDateShort(next, true)}`);
                return (
                  <li
                    key={entry.id}
                    className={cn("rounded border border-line", isEnded && "opacity-70")}
                  >
                    <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
                      <div
                        role="img"
                        aria-label={describeDaysOfWeek(entry.days_of_week)}
                        className="flex shrink-0 gap-1"
                      >
                        {DAY_ORDER.map((day) => (
                          <span
                            key={day}
                            aria-hidden="true"
                            className={cn(
                              "inline-flex size-8 items-center justify-center rounded border text-[13px] font-bold",
                              airingDays.includes(day)
                                ? "border-brand-primary bg-brand-primary text-white"
                                : "border-line bg-white text-ink-400",
                            )}
                          >
                            {DAY_LETTER[day]}
                          </span>
                        ))}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-xl font-bold tabular-nums text-ink-900">
                            {formatTimeRange(entry.air_time, entry.duration_minutes)}
                          </span>
                          {isEnded && (
                            <Badge variant="muted">Ended {formatDateShort(entry.end_date!)}</Badge>
                          )}
                        </div>
                        <div className="text-sm text-ink-700">{summaryParts.join(" · ")}</div>
                        {entry.notes && <div className="text-xs text-ink-400">{entry.notes}</div>}
                      </div>
                      {isProducer && (
                        <Link
                          href={editHref}
                          className="inline-flex h-9 shrink-0 items-center justify-center rounded border border-brand-link px-4 text-sm font-bold text-brand-link hover:bg-brand-surface"
                        >
                          Edit
                        </Link>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-panel-50 px-5 py-3">
                      <ClockThumb
                        slots={summary?.slots ?? []}
                        placeholder={placeholder}
                        size={40}
                        label={
                          placeholder
                            ? "Placeholder clock, one slot for the whole hour"
                            : `Clock face for ${entry.clockTemplateName}`
                        }
                      />
                      <div className="min-w-0 flex-1 leading-snug">
                        <span className="text-xs font-bold uppercase tracking-wider text-ink-500">
                          Runs on
                        </span>
                        <Link
                          href={clockHref}
                          className={cn(
                            "ml-2 text-[15px] font-bold hover:underline",
                            placeholder ? "text-ink-500" : "text-brand-link",
                          )}
                        >
                          {entry.clockTemplateName}
                        </Link>
                        {placeholder ? (
                          <>
                            <Badge variant="warning" className="ml-2">
                              Placeholder
                            </Badge>
                            <span className="ml-2 text-[13px] text-ink-500">
                              Shared with {Math.max(sharedBy - 1, 0)} other{" "}
                              {sharedBy === 2 ? "program" : "programs"}
                            </span>
                          </>
                        ) : (
                          <>
                            {summary?.current && (
                              <Badge variant="accent" className="ml-2">
                                {CLOCK_VARIANT_LABEL[summary.current.variant] ??
                                  summary.current.variant}
                              </Badge>
                            )}
                            {summary?.current && (
                              <span className="ml-2 text-[13px] text-ink-500">
                                Version in effect since{" "}
                                {formatDateShort(summary.current.effective_from)}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      <div className="flex gap-4 text-sm font-bold">
                        <Link href={clockHref} className="text-brand-link hover:underline">
                          Open clock
                        </Link>
                        {isProducer && (
                          <Link href={editHref} className="text-brand-link hover:underline">
                            Change clock
                          </Link>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {live.length > 0 && (
          <section aria-labelledby="week-heading" className="rounded border border-line px-5 py-4">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h3 id="week-heading" className="text-base font-bold text-ink-900">
                This week
              </h3>
              <Link
                href="/log/programs?view=week"
                className="text-sm font-bold text-brand-link hover:underline"
              >
                See the full week →
              </Link>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {week.map((day) => {
                const airs = day.airTimes.length > 0;
                return (
                  <div
                    key={day.dateISO}
                    className={cn(
                      "min-h-16 rounded border p-2.5",
                      airs ? "border-brand-primary/40 bg-brand-surface" : "border-line bg-white",
                    )}
                  >
                    <div className="text-[11px] font-bold uppercase tracking-wide text-ink-500">
                      {DAY_SHORT[day.dayOfWeek]}
                    </div>
                    <div
                      className={cn(
                        "mt-1.5 text-[13px] font-semibold",
                        airs ? "text-brand-link" : "text-ink-400",
                      )}
                    >
                      {airs ? day.airTimes.map((time) => formatAirTime(time)).join(", ") : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <aside aria-label="Program details" className="w-full shrink-0 lg:w-80">
        <DetailSummary
          title="Details"
          editHref={isProducer ? `/log/programs/${program.id}/edit` : undefined}
          editLabel="Edit program"
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
