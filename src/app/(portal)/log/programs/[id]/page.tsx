import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DetailSummary } from "@/components/ui/detail-summary";
import { ClockThumb } from "@/components/log/clock-thumb";
import { requireLogAccess } from "@/lib/log/access";
import { InlineCreateCard } from "@/components/ui/inline-create-card";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import {
  CLOCK_VARIANT_LABEL,
  deriveProgramStatus,
  formatDateShort,
  formatEntryDates,
  describeDaysOfWeek,
  formatLengthLong,
  formatTimeRange,
  isPlaceholderClockName,
  nextAiringDate,
  STATUS_LABEL,
} from "@/lib/log/program-status";
import { formatHour } from "@/lib/log/program-npr";
import { effectiveDays } from "@/lib/log/schedule-overlap";
import { stationTodayISO } from "@/lib/log/timezone";
import {
  getProgram,
  listClockSummaries,
  listClockTemplates,
  listPrograms,
  listScheduleEntries,
  listScheduleEntriesForProgram,
} from "@/lib/log/queries";
import { cn } from "@/lib/cn";
import { updateProgram } from "../../program-actions";

const STATUS_VARIANT = {
  on_real_clock: "success",
  needs_clock: "warning",
  not_scheduled: "neutral",
} as const;

const DAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];
/** Mon..Sun, as the day pills and the editor lay them out. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const SAVED_MESSAGE: Record<string, string> = {
  scheduled: "Scheduled",
  entry: "Entry saved",
  program: "Program saved",
};

/**
 * A program's own page, schedule first ("When it airs"): each entry as a card
 * with its days (or, for a one-time change or holiday, its dates), time range
 * and an Edit button, and below it the clock it runs on; for a program still
 * on the shared placeholder clock, a callout saying what that costs and how to
 * fix it. The right column is the program's own details, with its NPR
 * connection; producers edit them in place (`?edit=1`), including the NPR
 * collection and feed hour. One edit per thing: each entry's Edit opens the
 * schedule editor, and Details' Edit opens the program's fields.
 */
export default async function ProgramDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; edit?: string }>;
}) {
  const { id } = await params;
  const { error, saved, edit } = await searchParams;
  const { isProducer } = await requireLogAccess();
  const today = stationTodayISO();
  const [program, entries, templates, summaries, allEntries, allPrograms] = await Promise.all([
    getProgram(id),
    listScheduleEntriesForProgram(id),
    listClockTemplates(),
    listClockSummaries(today),
    listScheduleEntries(),
    listPrograms(),
  ]);
  if (!program) notFound();
  const editing = isProducer && edit === "1";
  const programPath = `/log/programs/${program.id}`;
  const sharesNprCollection =
    program.npr_collection_id === null
      ? []
      : allPrograms.filter(
          (other) =>
            other.id !== program.id && other.npr_collection_id === program.npr_collection_id,
        );

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

        {error && !editing && <Alert>{error}</Alert>}

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
          <div className="flex items-baseline justify-between gap-3">
            <h3 id="schedule-heading" className="text-base font-bold text-ink-900">
              When it airs
            </h3>
            <Link
              href="/log/programs?view=week"
              className="text-sm font-bold text-brand-link hover:underline"
            >
              See the full week →
            </Link>
          </div>
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
                const recurring = entry.entry_type === "recurring";
                const airingDays = effectiveDays(entry);
                const editHref = `/log/programs/${program.id}/schedule/${entry.id}/edit`;
                const clockHref = `/log/clocks/${entry.clock_template_id}?from=${program.id}`;
                const summaryParts = recurring
                  ? [
                      describeDaysOfWeek(entry.days_of_week),
                      formatLengthLong(entry.duration_minutes),
                      `from ${formatDateShort(entry.start_date)}`,
                    ]
                  : [
                      entry.entry_type === "override" ? "One-time change" : "Holiday",
                      formatLengthLong(entry.duration_minutes),
                    ];
                if (recurring && entry.end_date && !isEnded)
                  summaryParts.push(`to ${formatDateShort(entry.end_date)}`);
                if (next) summaryParts.push(`next airing ${formatDateShort(next, true)}`);
                return (
                  <li
                    key={entry.id}
                    className={cn("rounded border border-line", isEnded && "opacity-70")}
                  >
                    <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
                      {recurring ? (
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
                      ) : (
                        <div className="inline-flex h-8 shrink-0 items-center self-start rounded border border-brand-primary bg-brand-primary px-3 text-[13px] font-bold text-white sm:self-auto">
                          {formatEntryDates(entry)}
                        </div>
                      )}
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
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <aside aria-label="Program details" className="w-full shrink-0 lg:w-80">
        {editing ? (
          <InlineCreateCard
            title="Edit program"
            action={updateProgram}
            submitLabel="Save changes"
            cancelHref={programPath}
            sections={
              <fieldset className="flex flex-col gap-4 border-t border-line px-5 py-4">
                <legend className="float-left mb-1 text-sm font-bold text-ink-900">NPR</legend>
                <div className="clear-left">
                  <Label htmlFor="npr_collection_id">Collection ID</Label>
                  <Input
                    id="npr_collection_id"
                    name="npr_collection_id"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    defaultValue={program.npr_collection_id?.toString() ?? ""}
                  />
                  <FieldHint>
                    NPR&apos;s ID for this program. Leave blank if we don&apos;t pull NPR stories
                    for it.
                  </FieldHint>
                </div>
                <div>
                  <Label htmlFor="npr_feed_start_hour_et">Feed&apos;s first hour (Eastern)</Label>
                  <Select
                    id="npr_feed_start_hour_et"
                    name="npr_feed_start_hour_et"
                    defaultValue={program.npr_feed_start_hour_et?.toString() ?? ""}
                  >
                    <option value="">Same as our schedule</option>
                    {HOURS.map((hour) => (
                      <option key={hour} value={hour}>
                        {formatHour(hour)} ET
                      </option>
                    ))}
                  </Select>
                  <FieldHint>
                    Only matters for NPR&apos;s multi-hour shows, whose hours alternate on the feed.
                    Ignored without a collection ID.
                  </FieldHint>
                </div>
              </fieldset>
            }
          >
            <div className="flex flex-col gap-4">
              {error && <Alert>{error}</Alert>}
              <input type="hidden" name="id" value={program.id} />
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  name="name"
                  required
                  maxLength={120}
                  defaultValue={program.name}
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="kind">Kind</Label>
                <Select id="kind" name="kind" defaultValue={program.kind}>
                  <option value="recurring">Recurring</option>
                  <option value="special">Special</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  rows={3}
                  defaultValue={program.description ?? undefined}
                />
              </div>
            </div>
          </InlineCreateCard>
        ) : (
          <DetailSummary
            title="Details"
            editHref={isProducer ? `${programPath}?edit=1` : undefined}
            items={[
              { label: "Kind", value: program.kind },
              { label: "Description", value: program.description, preserveLines: true },
              {
                label: "NPR rundown",
                value:
                  program.npr_collection_id === null ? (
                    <span className="text-ink-500">Not connected</span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <span>
                        Connected ·{" "}
                        <Link
                          href={`/log/sources/npr?program=${program.id}`}
                          className="font-semibold text-brand-link hover:underline"
                        >
                          see today&apos;s stories →
                        </Link>
                      </span>
                      {isProducer && (
                        <span className="text-xs text-ink-500">
                          Collection {program.npr_collection_id}
                          {program.npr_feed_start_hour_et !== null &&
                            ` · first hour on the feed ${formatHour(program.npr_feed_start_hour_et)} ET`}
                        </span>
                      )}
                      {isProducer && sharesNprCollection.length > 0 && (
                        <span className="text-xs text-warning-fg">
                          Also used by {sharesNprCollection.map((other) => other.name).join(", ")}
                        </span>
                      )}
                    </div>
                  ),
              },
            ]}
          />
        )}
      </aside>
    </div>
  );
}
