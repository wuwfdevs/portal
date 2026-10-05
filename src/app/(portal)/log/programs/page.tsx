import Link from "next/link";
import { cn } from "@/lib/cn";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { InlineCreateCard } from "@/components/ui/inline-create-card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Pagination } from "@/components/ui/pagination";
import { PrimaryLink } from "@/components/ui/primary-link";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { ClockThumb } from "@/components/log/clock-thumb";
import { requireLogAccess } from "@/lib/log/access";
import { pageHref, pageInfo, pageRange, parsePage } from "@/lib/pagination";
import {
  deriveProgramStatus,
  formatDateShort,
  formatDaysOfWeek,
  formatDurationMinutes,
  isPlaceholderClockName,
  STATUS_LABEL,
  type ProgramScheduleStatus,
} from "@/lib/log/program-status";
import { formatAirTime, isScheduleEntryActiveOn } from "@/lib/log/schedule";
import { shiftDateISO, stationTodayISO } from "@/lib/log/timezone";
import {
  airTimeToMinutes,
  describeEntryDays,
  formatTimeRange,
  formatWeekRange,
  isValidDateISO,
  layoutDayBlocks,
  visibleHourRange,
  weekDates,
  weekStartISO,
} from "@/lib/log/week-layout";
import {
  listClockSummaries,
  listClockTemplates,
  listPrograms,
  listScheduleEntries,
} from "@/lib/log/queries";
import { createProgram } from "../program-actions";
import { WeekGrid, type WeekDay } from "./week-grid";

const PROGRAMS_PATH = "/log/programs";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "Week | List", real links — the active side is filled navy. */
function ViewToggle({ active }: { active: "week" | "list" }) {
  const base =
    "inline-flex h-9 items-center px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-900";
  return (
    <nav aria-label="View" className="inline-flex overflow-hidden rounded border border-[#C9CED4]">
      <Link
        href={`${PROGRAMS_PATH}?view=week`}
        aria-current={active === "week" ? "page" : undefined}
        className={cn(
          base,
          active === "week" ? "bg-[#0F2235] text-white" : "bg-white text-ink-900 hover:bg-panel-50",
        )}
      >
        Week
      </Link>
      <Link
        href={PROGRAMS_PATH}
        aria-current={active === "list" ? "page" : undefined}
        className={cn(
          base,
          "border-l border-[#C9CED4]",
          active === "list" ? "bg-[#0F2235] text-white" : "bg-white text-ink-900 hover:bg-panel-50",
        )}
      >
        List
      </Link>
    </nav>
  );
}

const STATUS_PARAM: Record<string, ProgramScheduleStatus> = {
  ready: "on_real_clock",
  "needs-clock": "needs_clock",
  unscheduled: "not_scheduled",
};

const STATUS_VARIANT = {
  on_real_clock: "success",
  needs_clock: "warning",
  not_scheduled: "neutral",
} as const;

/**
 * The programs list (docs/ui-patterns.md) — Log's one entry point for
 * scheduling and clocks, since nobody starts from a clock: each row shows the
 * program's air time and days, the clock it runs on (a thumbnail and a link
 * to that clock), and a status, so the programs still on the shared
 * placeholder clock are one filter away. Search, status chips and page
 * numbers are query-string state (`?q=`, `?status=`, `?page=`); a program is
 * three fields, so it is created inline (`?new=1`). The list is filtered in
 * application code because status is derived from the schedule, not stored.
 */
export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    new?: string;
    error?: string;
    status?: string;
    page?: string;
    unusedClocks?: string;
    view?: string;
    week?: string;
  }>;
}) {
  const {
    q,
    new: newParam,
    error,
    status,
    page: pageParam,
    unusedClocks,
    view,
    week,
  } = await searchParams;
  const { isProgramDirector } = await requireLogAccess();

  if (view === "week") {
    return <WeekView isProgramDirector={isProgramDirector} week={week} error={error} />;
  }
  const creating = isProgramDirector && newParam === "1";
  const query = (q ?? "").trim().toLowerCase();
  const statusFilter = status ? (STATUS_PARAM[status] ?? null) : null;
  const today = stationTodayISO();

  const [programs, scheduleEntries, templates, summaries] = await Promise.all([
    listPrograms(),
    listScheduleEntries(),
    listClockTemplates(),
    listClockSummaries(today),
  ]);

  const entriesByProgram = new Map<string, typeof scheduleEntries>();
  const programIdsByTemplate = new Map<string, Set<string>>();
  for (const entry of scheduleEntries) {
    const existing = entriesByProgram.get(entry.program_id);
    if (existing) existing.push(entry);
    else entriesByProgram.set(entry.program_id, [entry]);
    const programIds = programIdsByTemplate.get(entry.clock_template_id);
    if (programIds) programIds.add(entry.program_id);
    else programIdsByTemplate.set(entry.clock_template_id, new Set([entry.program_id]));
  }

  const rows = programs
    .filter((program) => query === "" || program.name.toLowerCase().includes(query))
    .map((program) => {
      const entries = entriesByProgram.get(program.id) ?? [];
      const live = entries
        .filter((entry) => entry.end_date === null || entry.end_date >= today)
        .sort((a, b) => a.air_time.localeCompare(b.air_time));
      return { program, live, status: deriveProgramStatus(entries, today) };
    });

  const counts: Record<ProgramScheduleStatus, number> = {
    on_real_clock: 0,
    needs_clock: 0,
    not_scheduled: 0,
  };
  for (const row of rows) counts[row.status] += 1;

  const shown = statusFilter ? rows.filter((row) => row.status === statusFilter) : rows;
  const info = pageInfo(parsePage(pageParam), shown.length);
  const { from, to } = pageRange(info.page);
  const pageRows = shown.slice(from, to + 1);

  const usedTemplateIds = new Set(scheduleEntries.map((entry) => entry.clock_template_id));
  const unused = templates.filter((template) => !usedTemplateIds.has(template.id));

  const chipHref = (value: string | null) => pageHref(PROGRAMS_PATH, { q, status: value }, 1);
  const chips = [
    { label: "All", href: chipHref(null), active: statusFilter === null, count: rows.length },
    {
      label: STATUS_LABEL.on_real_clock,
      href: chipHref("ready"),
      active: statusFilter === "on_real_clock",
      count: counts.on_real_clock,
    },
    {
      label: STATUS_LABEL.needs_clock,
      href: chipHref("needs-clock"),
      active: statusFilter === "needs_clock",
      count: counts.needs_clock,
    },
    {
      label: STATUS_LABEL.not_scheduled,
      href: chipHref("unscheduled"),
      active: statusFilter === "not_scheduled",
      count: counts.not_scheduled,
    },
  ];
  const listParams = { q, status };

  return (
    <div className="flex flex-col gap-4">
      <ListToolbar
        leading={<ViewToggle active="list" />}
        search={{
          placeholder: "Search programs",
          label: "Search programs",
          defaultValue: q,
          hidden: status ? { status } : undefined,
        }}
        chips={chips}
        chipsLabel="Status"
      >
        {isProgramDirector && !creating && (
          <PrimaryLink href={`${PROGRAMS_PATH}?new=1`}>
            <span>
              + New<span className="max-sm:sr-only"> program</span>
            </span>
          </PrimaryLink>
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
        <TableFrame>
          <Table stack>
            <thead>
              <HeaderRow>
                <Th>Program</Th>
                <Th>Airs</Th>
                <Th>Days</Th>
                <Th>Clock</Th>
                <Th>Status</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {pageRows.map(({ program, live, status: rowStatus }) => {
                const primary = live[0] ?? null;
                const summary = primary ? summaries.get(primary.clock_template_id) : undefined;
                const placeholder = primary
                  ? isPlaceholderClockName(primary.clockTemplateName)
                  : false;
                const sharedBy = primary
                  ? (programIdsByTemplate.get(primary.clock_template_id)?.size ?? 0)
                  : 0;
                return (
                  <Row key={program.id}>
                    <Cell stack="title">
                      <Link
                        href={`${PROGRAMS_PATH}/${program.id}`}
                        className="font-bold text-brand-link hover:underline"
                      >
                        {program.name}
                      </Link>
                      {program.kind === "special" && (
                        <Badge variant="warning" className="ml-2">
                          Special
                        </Badge>
                      )}
                    </Cell>
                    <Cell label="Airs" className="whitespace-nowrap">
                      {primary
                        ? `${formatAirTime(primary.air_time)} · ${formatDurationMinutes(primary.duration_minutes)}`
                        : "—"}
                    </Cell>
                    <Cell label="Days" className="whitespace-nowrap">
                      {primary
                        ? primary.entry_type === "recurring"
                          ? formatDaysOfWeek(primary.days_of_week)
                          : primary.entry_type === "override"
                            ? "Override"
                            : "Holiday"
                        : "—"}
                    </Cell>
                    <Cell label="Clock">
                      {primary ? (
                        <div className="flex items-center gap-3">
                          <ClockThumb
                            slots={summary?.slots ?? []}
                            placeholder={placeholder}
                            label={
                              placeholder
                                ? "Placeholder clock, one slot for the whole hour"
                                : `Clock face for ${primary.clockTemplateName}`
                            }
                          />
                          <div className="flex min-w-0 flex-col leading-tight">
                            <Link
                              href={`/log/clocks/${primary.clock_template_id}?from=${program.id}`}
                              className={
                                placeholder
                                  ? "font-semibold text-ink-500 hover:underline"
                                  : "font-semibold text-brand-link hover:underline"
                              }
                            >
                              {primary.clockTemplateName}
                            </Link>
                            <span className="text-xs text-ink-500">
                              {placeholder
                                ? `Shared by ${sharedBy} ${sharedBy === 1 ? "program" : "programs"}`
                                : summary?.current
                                  ? `Version in effect since ${formatDateShort(summary.current.effective_from)}${
                                      summary.versionCount > 1
                                        ? ` · ${summary.versionCount} versions`
                                        : ""
                                    }`
                                  : "No version yet"}
                              {live.length > 1 &&
                                ` · +${live.length - 1} more ${live.length === 2 ? "entry" : "entries"}`}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-ink-400">Schedule it to choose a clock</span>
                      )}
                    </Cell>
                    <Cell stack="aside">
                      <Badge variant={STATUS_VARIANT[rowStatus]}>{STATUS_LABEL[rowStatus]}</Badge>
                    </Cell>
                  </Row>
                );
              })}
            </tbody>
          </Table>
        </TableFrame>
      )}

      <Pagination info={info} path={PROGRAMS_PATH} params={listParams} noun="programs" />

      {unused.length > 0 && (
        <div className="text-xs text-ink-500">
          <Link
            href={pageHref(
              PROGRAMS_PATH,
              { ...listParams, unusedClocks: unusedClocks ? null : "1" },
              1,
            )}
            className="font-bold text-brand-link hover:underline"
          >
            Unused clocks ({unused.length})
          </Link>
          <span> — clocks no program is scheduled on.</span>
        </div>
      )}

      {unusedClocks === "1" && unused.length > 0 && (
        <div className="rounded border border-line">
          <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
            Unused clocks
          </div>
          <ul className="divide-y divide-line">
            {unused.map((template) => (
              <li key={template.id} className="px-5 py-3 text-sm">
                <Link
                  href={`/log/clocks/${template.id}`}
                  className="font-semibold text-brand-link hover:underline"
                >
                  {template.name}
                </Link>
                {template.description && (
                  <span className="ml-2 text-ink-500">{template.description}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * The week grid: one Monday–Sunday week, built from the same schedule entries
 * the list reads. `?week=` is any date (normalised to that week's Monday);
 * missing or invalid means the current week in station time.
 */
async function WeekView({
  isProgramDirector,
  week,
  error,
}: {
  isProgramDirector: boolean;
  week: string | undefined;
  error: string | undefined;
}) {
  const today = stationTodayISO();
  const monday = weekStartISO(isValidDateISO(week) ? week : today);
  const dates = weekDates(monday);
  const entries = await listScheduleEntries();

  const dayEntries = dates.map((dateISO) =>
    entries
      .filter((entry) => isScheduleEntryActiveOn(entry, dateISO))
      .map((entry) => ({
        entry,
        dateISO,
        id: `${entry.id}:${dateISO}`,
        startMinutes: airTimeToMinutes(entry.air_time),
        durationMinutes: entry.duration_minutes,
      })),
  );
  const { startHour, endHour } = visibleHourRange(dayEntries.flat());

  const days: WeekDay[] = dates.map((dateISO, index) => {
    const items = dayEntries[index] ?? [];
    const byId = new Map(items.map((item) => [item.id, item]));
    const blocks = layoutDayBlocks(items, startHour, endHour).flatMap((positioned) => {
      const item = byId.get(positioned.id);
      if (!item) return [];
      const { entry } = item;
      return [
        {
          key: item.id,
          entryId: entry.id,
          programId: entry.program_id,
          programName: entry.programName,
          timeText: formatTimeRange(entry.air_time, entry.duration_minutes),
          daysText: describeEntryDays(entry),
          clockName: entry.clockTemplateName,
          isPlaceholder: isPlaceholderClockName(entry.clockTemplateName),
          topMinutes: positioned.topMinutes,
          heightMinutes: positioned.heightMinutes,
          lane: positioned.lane,
          laneCount: positioned.laneCount,
        },
      ];
    });
    return { dateISO, name: DAY_NAMES[index] ?? "", num: Number(dateISO.slice(8)), blocks };
  });

  const weekHref = (dateISO: string) => `${PROGRAMS_PATH}?view=week&week=${dateISO}`;
  const navLink =
    "rounded border border-[#C9CED4] px-2.5 py-1.5 text-sm font-semibold text-ink-900 hover:bg-panel-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <ViewToggle active="week" />
        <h2 className="text-[15px] font-semibold text-ink-900 max-sm:order-first max-sm:w-full">
          {formatWeekRange(monday)}
        </h2>
        <Link href={weekHref(shiftDateISO(monday, -7))} className={navLink}>
          <span aria-hidden="true">← </span>Prev
          <span className="sr-only"> week</span>
        </Link>
        <Link href={weekHref(shiftDateISO(monday, 7))} className={navLink}>
          Next<span className="sr-only"> week</span>
          <span aria-hidden="true"> →</span>
        </Link>
        <Link href={`${PROGRAMS_PATH}?view=week`} className={navLink}>
          Today
        </Link>
        <span className="flex-1" />
        <span className="text-[13px] text-ink-700 max-md:hidden">
          <span
            aria-hidden="true"
            className="mr-1.5 inline-block size-3 border border-brand-primary/60 bg-brand-surface align-[-1px]"
          />
          Real clock
        </span>
        <span className="text-[13px] text-ink-700 max-md:hidden">
          <span
            aria-hidden="true"
            className="mr-1.5 inline-block size-3 border border-dashed border-warning-border bg-warning-bg align-[-1px]"
          />
          Needs a clock
        </span>
        {isProgramDirector && (
          <PrimaryLink href={`${PROGRAMS_PATH}?new=1`}>
            <span>
              + New<span className="max-sm:sr-only"> program</span>
            </span>
          </PrimaryLink>
        )}
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="max-md:hidden">
        <WeekGrid
          days={days}
          startHour={startHour}
          endHour={endHour}
          canEdit={isProgramDirector}
          todayISO={today}
        />
      </div>
      <WeekAgenda days={days} canEdit={isProgramDirector} todayISO={today} />

      <p className="text-[13px] text-ink-500">
        <span className="max-md:hidden">
          Select a block to edit when it airs or open its program.{" "}
        </span>
        Times are Central.
      </p>
    </div>
  );
}

/**
 * The same week as a day-by-day list, for screens too narrow for seven
 * columns (below `md`), where the grid would only scroll sideways. Each
 * airing links to its program; producers also get Edit, the grid's
 * "Edit schedule". A program still on the placeholder clock says so in the
 * warning colour, as its dashed block does in the grid.
 */
function WeekAgenda({
  days,
  canEdit,
  todayISO,
}: {
  days: WeekDay[];
  canEdit: boolean;
  todayISO: string;
}) {
  return (
    <div className="flex flex-col gap-4 md:hidden">
      {days.map((day) => {
        const blocks = [...day.blocks].sort((a, b) => a.topMinutes - b.topMinutes);
        const isToday = day.dateISO === todayISO;
        return (
          <section key={day.dateISO} aria-label={`${day.name} ${day.num}`}>
            <h3 className="mb-1.5 flex items-baseline gap-2 text-xs font-bold uppercase tracking-wider text-ink-500">
              {day.name} {day.num}
              {isToday && (
                <span className="normal-case tracking-normal text-brand-link">Today</span>
              )}
            </h3>
            {blocks.length === 0 ? (
              <p className="rounded border border-dashed border-line px-3 py-2 text-sm text-ink-500">
                Nothing scheduled.
              </p>
            ) : (
              <ul className="divide-y divide-line rounded border border-line">
                {blocks.map((block) => (
                  <li key={block.key} className="flex items-start gap-3 px-3 py-2.5">
                    <span className="w-[7.5rem] shrink-0 text-sm tabular-nums text-ink-700">
                      {block.timeText}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col leading-tight">
                      <Link
                        href={`${PROGRAMS_PATH}/${block.programId}`}
                        className="font-bold text-brand-link hover:underline"
                      >
                        {block.programName}
                      </Link>
                      <span
                        className={cn(
                          "mt-0.5 text-xs",
                          block.isPlaceholder ? "font-semibold text-warning-fg" : "text-ink-500",
                        )}
                      >
                        {block.isPlaceholder ? "Needs a clock" : block.clockName}
                      </span>
                    </div>
                    {canEdit && (
                      <Link
                        href={`${PROGRAMS_PATH}/${block.programId}/schedule/${block.entryId}/edit`}
                        className="shrink-0 text-sm font-semibold text-brand-link hover:underline"
                      >
                        Edit<span className="sr-only"> {block.programName} schedule</span>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
