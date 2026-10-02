import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { cn } from "@/lib/cn";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DayPicker } from "@/components/ui/day-picker";
import { FilterChips } from "@/components/ui/filter-chips";
import { InlineCreateCard } from "@/components/ui/inline-create-card";
import { Input, Label } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { PrimaryLink } from "@/components/ui/primary-link";
import { Segmented } from "@/components/ui/segmented";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireLogAccess } from "@/lib/log/access";
import {
  automatedHoursOnDay,
  automatedSegments,
  stationLocalParts,
  stationLocalToUTC,
  type OnAirChange,
  type WeeklyAutomatedWindow,
} from "@/lib/log/automated-hours";
import {
  formatChangeWhen,
  formatWindowHours,
  localFormValues,
  programsInWindow,
} from "@/lib/log/automated-hours-display";
import {
  countOnAirChanges,
  listOnAirChanges,
  listWeeklyWindows,
  loadAutomatedHours,
  ONE_TIME_CHANGES_PAGE_SIZE,
  toWeeklyWindow,
  type LogAutomatedWeeklyRow,
  type LogOnAirChangeRow,
} from "@/lib/log/automated-hours-queries";
import { formatDateShort, formatDaysOfWeek } from "@/lib/log/program-status";
import { listScheduleEntries, type ScheduleEntryWithNames } from "@/lib/log/queries";
import { isScheduleEntryActiveOn } from "@/lib/log/schedule";
import { shiftDateISO, stationTodayISO } from "@/lib/log/timezone";
import { formatWeekRange, isValidDateISO, weekDates, weekStartISO } from "@/lib/log/week-layout";
import { isPastLastPage, pageHref, pageInfo, parsePage } from "@/lib/pagination";
import {
  createOnAirChange,
  createWeeklyWindow,
  removeOnAirChange,
  removeWeeklyWindow,
  updateOnAirChange,
  updateWeeklyWindow,
} from "./actions";

const BASE_PATH = "/log/automated-hours";
const PX_PER_HOUR = 22;
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type View = "week" | "month";

/**
 * Automated hours (lib/log/automated-hours.ts): every hour is hosted unless
 * it's listed here, and the credits in automated hours go to DAD. A week or
 * month picture of the result, then the two kinds of record behind it —
 * weekly windows and one-time changes. Producers add and edit inline
 * (`?new=weekly`, `?new=once`, `?edit=<id>`); everyone else reads.
 */
export default async function AutomatedHoursPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    date?: string;
    new?: string;
    edit?: string;
    error?: string;
    changes?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const { isProgramDirector } = await requireLogAccess();
  const view: View = params.view === "month" ? "month" : "week";
  const today = stationTodayISO();
  const date = isValidDateISO(params.date) ? params.date : today;
  const scope = params.changes === "past" ? "past" : "upcoming";
  const page = parsePage(params.page);
  const nowISO = new Date().toISOString();

  const [hours, weeklyRows, changePage, changeCounts, scheduleEntries] = await Promise.all([
    loadAutomatedHours(),
    listWeeklyWindows(),
    listOnAirChanges(scope, page, nowISO),
    countOnAirChanges(nowISO),
    listScheduleEntries(),
  ]);

  const info = pageInfo(page, changePage.total, ONE_TIME_CHANGES_PAGE_SIZE);
  const listParams = {
    view: view === "month" ? "month" : null,
    date: params.date ?? null,
    changes: scope === "past" ? "past" : null,
  };
  if (isPastLastPage(info)) redirect(pageHref(BASE_PATH, listParams, info.pageCount));

  const keep = { view: listParams.view, date: listParams.date };
  const href = (extra: Record<string, string | null>) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...keep, ...extra })) {
      if (value) query.set(key, value);
    }
    const text = query.toString();
    return text ? `${BASE_PATH}?${text}` : BASE_PATH;
  };
  const closeHref = href({ changes: listParams.changes, page: page > 1 ? String(page) : null });
  const creating = isProgramDirector ? params.new : undefined;
  const editing = isProgramDirector ? params.edit : undefined;
  const error = params.error;
  const editingWeekly = weeklyRows.find((row) => row.id === editing) ?? null;
  const editingChange = changePage.rows.find((row) => row.id === editing) ?? null;
  const cardOpen = creating === "weekly" || creating === "once" || editingWeekly || editingChange;

  const hidden = (
    <>
      {view === "month" && <input type="hidden" name="view" value="month" />}
      {params.date && <input type="hidden" name="date" value={params.date} />}
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/log/programs"
          className="text-sm font-semibold text-brand-link hover:underline"
        >
          ← Programs
        </Link>
        <h1 className="text-xl font-bold text-ink-900">Automated hours</h1>
        <p className="text-sm text-ink-500">
          Every hour is hosted unless it&apos;s listed here. Credits in automated hours go to DAD.
        </p>
      </div>

      {error && !cardOpen && <Alert>{error}</Alert>}

      {view === "week" ? (
        <WeekView
          date={date}
          today={today}
          weekly={hours.weekly}
          changes={hours.changes}
          entries={scheduleEntries}
          reasons={hours.reasons}
          monthHref={href({ view: "month", date: params.date ?? null })}
          weekHref={(iso) => href({ view: null, date: iso })}
        />
      ) : (
        <MonthView
          date={date}
          today={today}
          weekly={hours.weekly}
          changes={hours.changes}
          weekHref={(iso) => href({ view: null, date: iso })}
          monthHref={(iso) => href({ view: "month", date: iso })}
        />
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-ink-900">Every week</h2>
          <span className="flex-1" />
          {isProgramDirector && !cardOpen && (
            <PrimaryLink href={href({ new: "weekly" })}>+ Weekly hours</PrimaryLink>
          )}
        </div>
        {(creating === "weekly" || editingWeekly) && (
          <WeeklyCard
            row={editingWeekly}
            today={today}
            error={error}
            cancelHref={closeHref}
            hidden={hidden}
          />
        )}
        <WeeklyTable
          rows={weeklyRows}
          entries={scheduleEntries}
          today={today}
          editHref={isProgramDirector ? (id) => href({ edit: id }) : null}
        />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-bold text-ink-900">One-time changes</h2>
          <FilterChips
            label="When"
            chips={[
              {
                label: "Upcoming",
                href: href({ changes: null }),
                active: scope === "upcoming",
                count: changeCounts.upcoming,
              },
              {
                label: "Past",
                href: href({ changes: "past" }),
                active: scope === "past",
                count: changeCounts.past,
              },
            ]}
          />
          <span className="flex-1" />
          {isProgramDirector && !cardOpen && (
            <PrimaryLink href={href({ new: "once", changes: listParams.changes })}>
              + One-time change
            </PrimaryLink>
          )}
        </div>
        {(creating === "once" || editingChange) && (
          <ChangeCard
            row={editingChange}
            date={date}
            error={error}
            cancelHref={closeHref}
            hidden={hidden}
          />
        )}
        <ChangesTable
          rows={changePage.rows}
          scope={scope}
          editHref={
            isProgramDirector
              ? (id) =>
                  href({
                    edit: id,
                    changes: listParams.changes,
                    page: page > 1 ? String(page) : null,
                  })
              : null
          }
        />
        <Pagination info={info} path={BASE_PATH} params={listParams} noun="changes" />
        <p className="text-[13px] text-ink-500">
          A one-time change wins over the weekly hours. One-time changes can&apos;t overlap each
          other. Times are Central.
        </p>
      </section>
    </div>
  );
}

function ViewToggle({
  active,
  weekHref,
  monthHref,
}: {
  active: View;
  weekHref: string;
  monthHref: string;
}) {
  const base =
    "inline-flex h-9 items-center px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-900";
  return (
    <nav aria-label="View" className="inline-flex overflow-hidden rounded border border-[#C9CED4]">
      <Link
        href={weekHref}
        aria-current={active === "week" ? "page" : undefined}
        className={cn(
          base,
          active === "week" ? "bg-[#0F2235] text-white" : "bg-white text-ink-900 hover:bg-panel-50",
        )}
      >
        Week
      </Link>
      <Link
        href={monthHref}
        aria-current={active === "month" ? "page" : undefined}
        className={cn(
          base,
          "border-l border-[#C9CED4]",
          active === "month"
            ? "bg-[#0F2235] text-white"
            : "bg-white text-ink-900 hover:bg-panel-50",
        )}
      >
        Month
      </Link>
    </nav>
  );
}

const navLink =
  "rounded border border-[#C9CED4] px-2.5 py-1.5 text-sm font-semibold text-ink-900 hover:bg-panel-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900";

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-700">
      <span>
        <span
          aria-hidden="true"
          className="mr-1.5 inline-block size-3 border border-[#8A9099] bg-[#DCE1E6] align-[-1px]"
        />
        Automated every week
      </span>
      <span>
        <span
          aria-hidden="true"
          className="mr-1.5 inline-block size-3 border border-dashed border-warning-border bg-warning-bg align-[-1px]"
        />
        Automated once
      </span>
      <span>
        <span
          aria-hidden="true"
          className="mr-1.5 inline-block size-3 border-2 border-dashed border-[#3090D0] bg-white align-[-1px]"
        />
        Live once
      </span>
    </div>
  );
}

/** Seconds since local midnight of `dateISO` at an instant on or after it: 86400 for the next midnight. */
function secondsIntoDay(instantISO: string, dateISO: string): number {
  const parts = stationLocalParts(instantISO);
  return parts.dateISO === dateISO ? parts.seconds : 86_400;
}

interface DayBlock {
  key: string;
  kind: "weekly" | "once" | "live";
  top: number;
  height: number;
  title: string;
  detail: string;
}

function clockAt(seconds: number): string {
  const hours = Math.floor(seconds / 3600) % 24;
  return `${hours}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}`;
}

function dayBlocks(
  dateISO: string,
  weekly: WeeklyAutomatedWindow[],
  changes: OnAirChange[],
  reasons: Map<string, string | null>,
): DayBlock[] {
  return automatedSegments(dateISO, weekly, changes)
    .filter((segment) => segment.source !== "default")
    .map((segment, index) => {
      const from = secondsIntoDay(segment.startsAt, dateISO);
      const to = secondsIntoDay(segment.endsAt, dateISO);
      const kind: DayBlock["kind"] =
        segment.source === "weekly" ? "weekly" : segment.automated ? "once" : "live";
      const hours = formatWindowHours(clockAt(from), clockAt(to));
      const reason = segment.changeId ? (reasons.get(segment.changeId) ?? null) : null;
      return {
        key: `${dateISO}-${index}`,
        kind,
        top: (from / 3600) * PX_PER_HOUR,
        height: ((to - from) / 3600) * PX_PER_HOUR,
        title: kind === "weekly" ? "Automated" : kind === "once" ? "Automated once" : "Live once",
        detail: reason ? `${reason} · ${hours}` : hours,
      };
    });
}

function WeekView({
  date,
  today,
  weekly,
  changes,
  entries,
  reasons,
  monthHref,
  weekHref,
}: {
  date: string;
  today: string;
  weekly: WeeklyAutomatedWindow[];
  changes: OnAirChange[];
  entries: ScheduleEntryWithNames[];
  reasons: Map<string, string | null>;
  monthHref: string;
  weekHref: (iso: string | null) => string;
}) {
  const monday = weekStartISO(date);
  const dates = weekDates(date);
  const days = dates.map((dateISO, index) => ({
    dateISO,
    name: DAY_NAMES[index] ?? "",
    num: Number(dateISO.slice(8)),
    blocks: dayBlocks(dateISO, weekly, changes, reasons),
    programs: entries
      .filter((entry) => isScheduleEntryActiveOn(entry, dateISO))
      .map((entry) => {
        const [h = "0", m = "0"] = entry.air_time.split(":");
        const start = Number(h) * 60 + Number(m);
        return {
          key: entry.id,
          name: entry.programName,
          top: (start / 60) * PX_PER_HOUR,
          height: (Math.min(entry.duration_minutes, 1440 - start) / 60) * PX_PER_HOUR,
        };
      }),
    automatedHours: automatedHoursOnDay(dateISO, weekly, changes),
  }));
  const hourLabels = Array.from({ length: 8 }, (_, i) => i * 3);

  return (
    <section className="flex flex-col gap-3" aria-label="Week">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <ViewToggle active="week" weekHref={weekHref(null)} monthHref={monthHref} />
        <h2 className="text-[15px] font-semibold text-ink-900 max-sm:order-first max-sm:w-full">
          {formatWeekRange(monday)}
        </h2>
        <Link href={weekHref(shiftDateISO(monday, -7))} className={navLink}>
          <span aria-hidden="true">← </span>Prev<span className="sr-only"> week</span>
        </Link>
        <Link href={weekHref(shiftDateISO(monday, 7))} className={navLink}>
          Next<span className="sr-only"> week</span>
          <span aria-hidden="true"> →</span>
        </Link>
        <Link href={weekHref(null)} className={navLink}>
          Today
        </Link>
      </div>
      <Legend />

      <div className="overflow-hidden rounded border border-line max-md:hidden">
        <div className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))] border-b border-line bg-panel-50">
          <span />
          {days.map((day) => (
            <Link
              key={day.dateISO}
              href={weekHref(day.dateISO)}
              className={cn(
                "border-l border-line px-2.5 py-2 text-xs font-bold uppercase tracking-wider hover:underline",
                day.dateISO === today ? "text-brand-link" : "text-ink-500",
              )}
            >
              {day.name} {day.num}
              {day.dateISO === today && (
                <span className="normal-case tracking-normal"> · Today</span>
              )}
              <span className="block text-[11px] font-semibold normal-case tracking-normal text-ink-500">
                {day.automatedHours === 0 ? "Hosted" : `${day.automatedHours}h automated`}
              </span>
            </Link>
          ))}
        </div>
        <div
          className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))]"
          style={{ height: 24 * PX_PER_HOUR }}
        >
          <div className="relative">
            {hourLabels.map((hour) => (
              <span
                key={hour}
                className="absolute right-2 text-[11px] text-ink-500"
                style={{ top: Math.max(0, hour * PX_PER_HOUR - 6) }}
              >
                {hour === 0
                  ? "12a"
                  : hour === 12
                    ? "12p"
                    : hour > 12
                      ? `${hour - 12}p`
                      : `${hour}a`}
              </span>
            ))}
          </div>
          {days.map((day) => (
            <div key={day.dateISO} className="relative border-l border-line">
              {day.programs.map((program) => (
                <span
                  key={program.key}
                  aria-hidden="true"
                  className="absolute inset-x-0 overflow-hidden border-t border-[#ECEFF2] pr-2 pt-0.5 text-right text-[10px] font-semibold text-[#8A9099]"
                  style={{ top: program.top, height: program.height }}
                >
                  {program.name}
                </span>
              ))}
              {day.blocks.map((block) => (
                <div
                  key={block.key}
                  className={cn(
                    "absolute inset-x-1.5 flex flex-col gap-px overflow-hidden rounded-[3px] px-1.5 py-0.5 text-[11px] leading-tight",
                    block.kind === "weekly" && "border border-[#8A9099] bg-[#DCE1E6]/95",
                    block.kind === "once" &&
                      "border border-dashed border-warning-border bg-warning-bg/95",
                    block.kind === "live" &&
                      "z-[1] border-2 border-dashed border-[#3090D0] bg-white",
                  )}
                  style={{ top: block.top + 1, height: Math.max(block.height - 2, 10) }}
                >
                  <span className="font-bold text-ink-900">{block.title}</span>
                  {block.height >= 30 && <span className="text-ink-700">{block.detail}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 md:hidden">
        {days.map((day) => (
          <section key={day.dateISO} aria-label={`${day.name} ${day.num}`}>
            <h3 className="mb-1.5 flex items-baseline gap-2 text-xs font-bold uppercase tracking-wider text-ink-500">
              {day.name} {day.num}
              {day.dateISO === today && (
                <span className="normal-case tracking-normal text-brand-link">Today</span>
              )}
            </h3>
            {day.blocks.length === 0 ? (
              <p className="rounded border border-dashed border-line px-3 py-2 text-sm text-ink-500">
                Hosted all day.
              </p>
            ) : (
              <ul className="divide-y divide-line rounded border border-line">
                {day.blocks.map((block) => (
                  <li key={block.key} className="flex gap-3 px-3 py-2.5 text-sm">
                    <span className="font-bold text-ink-900">{block.title}</span>
                    <span className="text-ink-700">{block.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </section>
  );
}

function MonthView({
  date,
  today,
  weekly,
  changes,
  weekHref,
  monthHref,
}: {
  date: string;
  today: string;
  weekly: WeeklyAutomatedWindow[];
  changes: OnAirChange[];
  weekHref: (iso: string) => string;
  monthHref: (iso: string) => string;
}) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const first = `${date.slice(0, 7)}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leading = new Date(`${first}T12:00:00Z`).getUTCDay();
  const previousMonth = shiftDateISO(first, -1).slice(0, 7) + "-01";
  const nextMonth = shiftDateISO(first, 31).slice(0, 7) + "-01";
  const cells = Array.from({ length: Math.ceil((leading + daysInMonth) / 7) * 7 }, (_, i) => {
    const day = i - leading + 1;
    if (day < 1 || day > daysInMonth) return null;
    const dateISO = `${date.slice(0, 7)}-${String(day).padStart(2, "0")}`;
    const dayStart = Date.parse(stationLocalToUTC(dateISO, "00:00:00"));
    const dayEnd = Date.parse(stationLocalToUTC(shiftDateISO(dateISO, 1), "00:00:00"));
    const change = changes.find(
      (c) => c.active && Date.parse(c.startsAt) < dayEnd && Date.parse(c.endsAt) > dayStart,
    );
    return {
      dateISO,
      day,
      hours: automatedHoursOnDay(dateISO, weekly, changes),
      change: change ? { mode: change.mode, id: change.id } : null,
    };
  });

  return (
    <section className="flex flex-col gap-3" aria-label="Month">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <ViewToggle active="month" weekHref={weekHref(date)} monthHref={monthHref(date)} />
        <h2 className="text-[15px] font-semibold text-ink-900 max-sm:order-first max-sm:w-full">
          {MONTH_NAMES[month - 1]} {year}
        </h2>
        <Link href={monthHref(previousMonth)} className={navLink}>
          <span aria-hidden="true">← </span>Prev<span className="sr-only"> month</span>
        </Link>
        <Link href={monthHref(nextMonth)} className={navLink}>
          Next<span className="sr-only"> month</span>
          <span aria-hidden="true"> →</span>
        </Link>
        <Link href={monthHref(today)} className={navLink}>
          Today
        </Link>
      </div>
      <div className="overflow-hidden rounded border border-line">
        <div className="grid grid-cols-7 border-b border-line bg-panel-50">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((name) => (
            <span
              key={name}
              className="px-2 py-2 text-xs font-bold uppercase tracking-wider text-ink-500"
            >
              {name}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell, index) =>
            cell === null ? (
              <span
                key={`blank-${index}`}
                className="min-h-16 border-b border-r border-line bg-panel-50 sm:min-h-24"
              />
            ) : (
              <Link
                key={cell.dateISO}
                href={weekHref(cell.dateISO)}
                className="flex min-h-16 flex-col gap-1 border-b border-r border-line bg-white p-1.5 hover:bg-panel-50 sm:min-h-24 sm:p-2.5"
              >
                <span
                  className={cn(
                    "text-sm font-bold",
                    cell.dateISO === today ? "text-brand-link" : "text-ink-900",
                  )}
                >
                  {cell.day}
                </span>
                <span className="text-[11px] text-ink-700 sm:text-xs">
                  {cell.hours === 0 ? "Hosted" : `${cell.hours}h automated`}
                </span>
                {cell.change && (
                  <span
                    className={cn(
                      "truncate text-[11px] font-semibold sm:text-xs",
                      cell.change.mode === "live" ? "text-[#185F95]" : "text-warning-fg",
                    )}
                  >
                    {cell.change.mode === "live" ? "Live once" : "Automated once"}
                  </span>
                )}
              </Link>
            ),
          )}
        </div>
      </div>
      <p className="text-[13px] text-ink-500">
        Each day shows how many hours are automated. Pick a day to see its week.
      </p>
    </section>
  );
}

function formatSince(row: LogAutomatedWeeklyRow): string {
  return row.effective_to
    ? `${formatDateShort(row.effective_from)} – ${formatDateShort(row.effective_to)}`
    : formatDateShort(row.effective_from);
}

function WeeklyTable({
  rows,
  entries,
  today,
  editHref,
}: {
  rows: LogAutomatedWeeklyRow[];
  entries: ScheduleEntryWithNames[];
  today: string;
  editHref: ((id: string) => string) | null;
}) {
  if (rows.length === 0) {
    return (
      <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
        No weekly automated hours. Every week is hosted.
      </div>
    );
  }
  return (
    <TableFrame>
      <Table stack>
        <thead>
          <HeaderRow>
            <Th>Days</Th>
            <Th>Hours</Th>
            <Th>Programs in these hours</Th>
            <Th>Since</Th>
            {editHref && (
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            )}
          </HeaderRow>
        </thead>
        <tbody>
          {rows.map((row) => {
            const programs = programsInWindow(toWeeklyWindow(row), entries, today);
            return (
              <Row key={row.id}>
                <Cell stack="title">
                  {formatDaysOfWeek(row.days_of_week)}
                  {row.reason && (
                    <span className="block text-xs font-normal text-ink-500">{row.reason}</span>
                  )}
                </Cell>
                <Cell label="Hours" className="whitespace-nowrap">
                  {formatWindowHours(row.start_time, row.end_time)}
                </Cell>
                <Cell label="Programs">{programs.length > 0 ? programs.join(", ") : "—"}</Cell>
                <Cell label="Since" className="whitespace-nowrap">
                  {formatSince(row)}
                </Cell>
                {editHref && (
                  <Cell stack="aside">
                    <Link
                      href={editHref(row.id)}
                      className="text-sm font-semibold text-brand-link hover:underline"
                    >
                      Edit
                    </Link>
                  </Cell>
                )}
              </Row>
            );
          })}
        </tbody>
      </Table>
    </TableFrame>
  );
}

function ChangesTable({
  rows,
  scope,
  editHref,
}: {
  rows: LogOnAirChangeRow[];
  scope: "upcoming" | "past";
  editHref: ((id: string) => string) | null;
}) {
  if (rows.length === 0) {
    return (
      <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
        {scope === "upcoming" ? "No one-time changes coming up." : "No past one-time changes."}
      </div>
    );
  }
  return (
    <TableFrame>
      <Table stack>
        <thead>
          <HeaderRow>
            <Th>When</Th>
            <Th>Change</Th>
            <Th>Reason</Th>
            {editHref && (
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            )}
          </HeaderRow>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Row key={row.id}>
              <Cell stack="title">{formatChangeWhen(row.starts_at, row.ends_at)}</Cell>
              <Cell label="Change">
                <Badge variant={row.mode === "automated" ? "warning" : "accent"}>
                  {row.mode === "automated" ? "Automated" : "Live"}
                </Badge>
              </Cell>
              <Cell label="Reason">{row.reason ?? "—"}</Cell>
              {editHref && (
                <Cell stack="aside">
                  <Link
                    href={editHref(row.id)}
                    className="text-sm font-semibold text-brand-link hover:underline"
                  >
                    Edit
                  </Link>
                </Cell>
              )}
            </Row>
          ))}
        </tbody>
      </Table>
    </TableFrame>
  );
}

function WeeklyCard({
  row,
  today,
  error,
  cancelHref,
  hidden,
}: {
  row: LogAutomatedWeeklyRow | null;
  today: string;
  error: string | undefined;
  cancelHref: string;
  hidden: ReactNode;
}) {
  return (
    <InlineCreateCard
      title={row ? "Edit weekly hours" : "New weekly automated hours"}
      action={row ? updateWeeklyWindow : createWeeklyWindow}
      submitLabel={row ? "Save" : "Add hours"}
      cancelHref={cancelHref}
      sections={
        row ? (
          <div className="border-t border-line px-5 py-3">
            <Button type="submit" variant="ghost" formAction={removeWeeklyWindow} formNoValidate>
              Remove these hours
            </Button>
          </div>
        ) : undefined
      }
    >
      {hidden}
      {row && <input type="hidden" name="id" value={row.id} />}
      {error && <Alert className="mb-4">{error}</Alert>}
      <div className="flex flex-col gap-4">
        <div>
          <span className="mb-1.5 block text-sm font-semibold text-ink-900">Days</span>
          <DayPicker name="day" defaultValue={row?.days_of_week ?? [0, 1, 2, 3, 4, 5, 6]} />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
          <div>
            <Label htmlFor="start_time">From</Label>
            <Input
              id="start_time"
              name="start_time"
              type="time"
              required
              defaultValue={row?.start_time.slice(0, 5) ?? "20:00"}
            />
          </div>
          <div>
            <Label htmlFor="end_time">Until</Label>
            <Input
              id="end_time"
              name="end_time"
              type="time"
              required
              defaultValue={row?.end_time.slice(0, 5) ?? "05:00"}
            />
          </div>
        </div>
        <p className="-mt-2 text-[13px] text-ink-500">
          An end at or before the start runs past midnight into the next morning.
        </p>
        <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
          <div>
            <Label htmlFor="effective_from">Starting</Label>
            <Input
              id="effective_from"
              name="effective_from"
              type="date"
              required
              defaultValue={row?.effective_from ?? today}
            />
          </div>
          <div>
            <Label htmlFor="effective_to">Ending (optional)</Label>
            <Input
              id="effective_to"
              name="effective_to"
              type="date"
              defaultValue={row?.effective_to ?? ""}
            />
          </div>
        </div>
        <div className="sm:max-w-md">
          <Label htmlFor="reason">Note (optional)</Label>
          <Input
            id="reason"
            name="reason"
            maxLength={200}
            placeholder="Overnights"
            defaultValue={row?.reason ?? ""}
          />
        </div>
      </div>
    </InlineCreateCard>
  );
}

function ChangeCard({
  row,
  date,
  error,
  cancelHref,
  hidden,
}: {
  row: LogOnAirChangeRow | null;
  date: string;
  error: string | undefined;
  cancelHref: string;
  hidden: ReactNode;
}) {
  const from = row ? localFormValues(row.starts_at) : { date, time: "00:00" };
  const until = row ? localFormValues(row.ends_at) : { date: shiftDateISO(date, 1), time: "00:00" };
  return (
    <InlineCreateCard
      title={row ? "Edit one-time change" : "New one-time change"}
      action={row ? updateOnAirChange : createOnAirChange}
      submitLabel={row ? "Save" : "Add change"}
      cancelHref={cancelHref}
      sections={
        row ? (
          <div className="border-t border-line px-5 py-3">
            <Button type="submit" variant="ghost" formAction={removeOnAirChange} formNoValidate>
              Remove this change
            </Button>
          </div>
        ) : undefined
      }
    >
      {hidden}
      {row && <input type="hidden" name="id" value={row.id} />}
      {error && <Alert className="mb-4">{error}</Alert>}
      <div className="flex flex-col gap-4">
        <div>
          <span className="mb-1.5 block text-sm font-semibold text-ink-900">These hours are</span>
          <Segmented
            name="mode"
            defaultValue={row?.mode ?? "automated"}
            options={[
              { value: "automated", label: "Automated" },
              { value: "live", label: "Live" },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:max-w-md">
          <div>
            <Label htmlFor="from_date">From</Label>
            <Input id="from_date" name="from_date" type="date" required defaultValue={from.date} />
          </div>
          <div>
            <Label htmlFor="from_time">Time</Label>
            <Input id="from_time" name="from_time" type="time" required defaultValue={from.time} />
          </div>
          <div>
            <Label htmlFor="until_date">Until</Label>
            <Input
              id="until_date"
              name="until_date"
              type="date"
              required
              defaultValue={until.date}
            />
          </div>
          <div>
            <Label htmlFor="until_time">Time</Label>
            <Input
              id="until_time"
              name="until_time"
              type="time"
              required
              defaultValue={until.time}
            />
          </div>
        </div>
        <p className="-mt-2 text-[13px] text-ink-500">
          Midnight to midnight covers whole days. The change ends at the &ldquo;Until&rdquo; time.
        </p>
        <div className="sm:max-w-md">
          <Label htmlFor="reason">Reason (optional)</Label>
          <Input
            id="reason"
            name="reason"
            maxLength={200}
            placeholder="Thanksgiving"
            defaultValue={row?.reason ?? ""}
          />
        </div>
      </div>
    </InlineCreateCard>
  );
}
