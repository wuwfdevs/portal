import { parseTimeToMinutes } from "@/lib/time-of-day";
import { EmptyState } from "@/components/ui/empty-state";
import { WeekMonthLinks } from "@/components/ui/segmented";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { dayOfWeekISO } from "@/lib/dates";
import {
  automatedHoursOnDay,
  automatedSegments,
  stationLocalParts,
  stationLocalToUTC,
  type OnAirChange,
  type WeeklyAutomatedWindow,
} from "@/lib/log/automated-hours";
import { formatWindowHours } from "@/lib/log/automated-hours-display";
import {
  closedHoursOnDay,
  closedSegments,
  type ClosedWeeklyWindow,
  type UnderwritingHourChange,
} from "@/lib/log/underwriting-hours";
import { entriesInForceOn } from "@/lib/log/schedule";
import { shiftDateISO } from "@/lib/log/timezone";
import { formatWeekRange, weekDates, weekStartISO } from "@/lib/log/week-layout";
import type { ScheduleEntryWithNames } from "@/lib/log/queries";

/**
 * The week-or-month picture the Automation and Underwriting pages share:
 * one hour axis, the programs on the air drawn faintly behind, and two
 * layers over them — the page's own subject (`primary`, drawn as labelled
 * blocks) and the other page's hours (`context`, a faint full-width band),
 * so either page shows both without either page copying the other's
 * records. A layer is built from its own tables by automatedLayer() or
 * underwritingLayer(); which is primary is the page's call. Server
 * component: nothing here is interactive beyond links.
 */

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

export type CalendarView = "week" | "month";

export interface CalendarBlock {
  key: string;
  /** Seconds since the day's local midnight. */
  fromSeconds: number;
  toSeconds: number;
  title: string;
  detail: string;
  /** The block's look when this layer is the page's subject. */
  className: string;
  /** Drawn above the other blocks (a one-time exception cut into a weekly window). */
  raised?: boolean;
}

export interface LegendItem {
  label: string;
  swatchClassName: string;
}

export interface HoursLayer {
  key: "automated" | "underwriting";
  blocksOn: (dateISO: string) => CalendarBlock[];
  /** The day's figure: "Hosted" / "9h automated", "Open" / "12h closed". */
  summaryOn: (dateISO: string) => string;
  /** A one-time change touching the day, for the month cell. */
  changeOn: (dateISO: string) => { label: string; className: string } | null;
  legend: LegendItem[];
  /** The band's look and name when this layer is the other page's context. */
  context: { className: string; label: string; legendLabel: string; editHint: string };
  /** The month view's footnote. */
  monthNote: string;
}

/** Seconds since local midnight of `dateISO` at an instant on or after it: 86400 for the next midnight. */
function secondsIntoDay(instantISO: string, dateISO: string): number {
  const parts = stationLocalParts(instantISO);
  return parts.dateISO === dateISO ? parts.seconds : 86_400;
}

function clockAt(seconds: number): string {
  const hours = Math.floor(seconds / 3600) % 24;
  return `${hours}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}`;
}

function changeTouching<T extends { active: boolean; startsAt: string; endsAt: string }>(
  dateISO: string,
  changes: T[],
): T | null {
  const dayStart = Date.parse(stationLocalToUTC(dateISO, "00:00:00"));
  const dayEnd = Date.parse(stationLocalToUTC(shiftDateISO(dateISO, 1), "00:00:00"));
  return (
    changes.find(
      (c) => c.active && Date.parse(c.startsAt) < dayEnd && Date.parse(c.endsAt) > dayStart,
    ) ?? null
  );
}

const AUTOMATED_WEEKLY = "border border-[#8A9099] bg-[#DCE1E6]/95";
const AUTOMATED_ONCE = "border border-dashed border-warning-border bg-warning-bg/95";
const LIVE_ONCE = "border-2 border-dashed border-[#3090D0] bg-white";
/** A diagonal hatch, the clock diagram's own mark for a window that is not solid content. */
const CLOSED_HATCH =
  "bg-[repeating-linear-gradient(135deg,rgba(166,52,52,0.22)_0_4px,rgba(255,255,255,0.9)_4px_9px)]";
const CLOSED_WEEKLY = `border border-[#B45454] ${CLOSED_HATCH}`;
const CLOSED_ONCE = `border border-dashed border-[#B45454] ${CLOSED_HATCH}`;
const OPEN_ONCE = "border-2 border-dashed border-[#2E7D32] bg-white";

/** Automated hours as a layer (lib/log/automated-hours.ts). */
export function automatedLayer(hours: {
  weekly: WeeklyAutomatedWindow[];
  changes: OnAirChange[];
  reasons: Map<string, string | null>;
}): HoursLayer {
  return {
    key: "automated",
    blocksOn: (dateISO) =>
      automatedSegments(dateISO, hours.weekly, hours.changes)
        .filter((segment) => segment.source !== "default")
        .map((segment, index) => {
          const from = secondsIntoDay(segment.startsAt, dateISO);
          const to = secondsIntoDay(segment.endsAt, dateISO);
          const kind = segment.source === "weekly" ? "weekly" : segment.automated ? "once" : "live";
          const range = formatWindowHours(clockAt(from), clockAt(to));
          const reason = segment.changeId ? (hours.reasons.get(segment.changeId) ?? null) : null;
          return {
            key: `${dateISO}-${index}`,
            fromSeconds: from,
            toSeconds: to,
            title:
              kind === "weekly" ? "Automated" : kind === "once" ? "Automated once" : "Live once",
            detail: reason ? `${reason} · ${range}` : range,
            className:
              kind === "weekly" ? AUTOMATED_WEEKLY : kind === "once" ? AUTOMATED_ONCE : LIVE_ONCE,
            raised: kind === "live",
          };
        }),
    summaryOn: (dateISO) => {
      const total = automatedHoursOnDay(dateISO, hours.weekly, hours.changes);
      return total === 0 ? "Hosted" : `${total}h automated`;
    },
    changeOn: (dateISO) => {
      const change = changeTouching(dateISO, hours.changes);
      if (!change) return null;
      return change.mode === "live"
        ? { label: "Live once", className: "text-[#185F95]" }
        : { label: "Automated once", className: "text-warning-fg" };
    },
    legend: [
      { label: "Automated every week", swatchClassName: "border border-[#8A9099] bg-[#DCE1E6]" },
      {
        label: "Automated once",
        swatchClassName: "border border-dashed border-warning-border bg-warning-bg",
      },
      { label: "Live once", swatchClassName: "border-2 border-dashed border-[#3090D0] bg-white" },
    ],
    context: {
      className: "bg-[#DCE1E6]/55",
      label: "Automated",
      legendLabel: "Automated hours",
      editHint: "Edit under Automation",
    },
    monthNote: "Each day shows how many hours are automated. Pick a day to see its week.",
  };
}

/** Hours closed to underwriting as a layer (lib/log/underwriting-hours.ts). */
export function underwritingLayer(hours: {
  weekly: ClosedWeeklyWindow[];
  changes: UnderwritingHourChange[];
  reasons: Map<string, string | null>;
}): HoursLayer {
  return {
    key: "underwriting",
    blocksOn: (dateISO) =>
      closedSegments(dateISO, hours.weekly, hours.changes)
        .filter((segment) => segment.source !== "default")
        .map((segment, index) => {
          const from = secondsIntoDay(segment.startsAt, dateISO);
          const to = secondsIntoDay(segment.endsAt, dateISO);
          const kind = segment.source === "weekly" ? "weekly" : segment.closed ? "once" : "open";
          const range = formatWindowHours(clockAt(from), clockAt(to));
          const reason = segment.changeId ? (hours.reasons.get(segment.changeId) ?? null) : null;
          return {
            key: `${dateISO}-${index}`,
            fromSeconds: from,
            toSeconds: to,
            title: kind === "weekly" ? "Closed" : kind === "once" ? "Closed once" : "Open once",
            detail: reason ? `${reason} · ${range}` : range,
            className:
              kind === "weekly" ? CLOSED_WEEKLY : kind === "once" ? CLOSED_ONCE : OPEN_ONCE,
            raised: kind === "open",
          };
        }),
    summaryOn: (dateISO) => {
      const total = closedHoursOnDay(dateISO, hours.weekly, hours.changes);
      return total === 0 ? "Open" : `${total}h closed`;
    },
    changeOn: (dateISO) => {
      const change = changeTouching(dateISO, hours.changes);
      if (!change) return null;
      return change.mode === "open"
        ? { label: "Open once", className: "text-[#2E7D32]" }
        : { label: "Closed once", className: "text-[#8F3A3A]" };
    },
    legend: [
      { label: "Closed every week", swatchClassName: CLOSED_WEEKLY },
      { label: "Closed once", swatchClassName: CLOSED_ONCE },
      { label: "Open once", swatchClassName: OPEN_ONCE },
    ],
    context: {
      className: `${CLOSED_HATCH} opacity-60`,
      label: "Closed to underwriting",
      legendLabel: "Closed to underwriting",
      editHint: "Edit under Underwriting",
    },
    monthNote:
      "Each day shows how many hours are closed to underwriting. Pick a day to see its week.",
  };
}

const navLink =
  "rounded border border-line px-2.5 py-1.5 text-sm font-semibold text-ink-900 hover:bg-panel-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900";

function Legend({ primary, context }: { primary: HoursLayer; context: HoursLayer }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-700">
      {primary.legend.map((item) => (
        <span key={item.label}>
          <span
            aria-hidden="true"
            className={cn("mr-1.5 inline-block size-3 align-[-1px]", item.swatchClassName)}
          />
          {item.label}
        </span>
      ))}
      <span className="text-ink-500">
        <span
          aria-hidden="true"
          className={cn("mr-1.5 inline-block size-3 align-[-1px]", context.context.className)}
        />
        {context.context.legendLabel}
        <span className="text-ink-400"> · {context.context.editHint}</span>
      </span>
    </div>
  );
}

export interface HoursCalendarProps {
  view: CalendarView;
  /** The selected date: its week, or its month. */
  date: string;
  today: string;
  entries: ScheduleEntryWithNames[];
  primary: HoursLayer;
  context: HoursLayer;
  /** The week view at a date, or at today when null. */
  weekHref: (dateISO: string | null) => string;
  monthHref: (dateISO: string) => string;
}

export function HoursCalendar(props: HoursCalendarProps) {
  return props.view === "week" ? <WeekView {...props} /> : <MonthView {...props} />;
}

function WeekView({
  date,
  today,
  entries,
  primary,
  context,
  weekHref,
  monthHref,
}: HoursCalendarProps) {
  const monday = weekStartISO(date);
  const dates = weekDates(date);
  const days = dates.map((dateISO, index) => ({
    dateISO,
    name: DAY_NAMES[index] ?? "",
    num: Number(dateISO.slice(8)),
    blocks: primary.blocksOn(dateISO),
    bands: context.blocksOn(dateISO),
    programs: entriesInForceOn(entries, dateISO).map((entry) => {
      const start = parseTimeToMinutes(entry.air_time);
      return {
        key: entry.id,
        name: entry.programName,
        top: (start / 60) * PX_PER_HOUR,
        height: (Math.min(entry.duration_minutes, 1440 - start) / 60) * PX_PER_HOUR,
      };
    }),
    summary: `${primary.summaryOn(dateISO)} · ${context.summaryOn(dateISO).toLowerCase()}`,
  }));
  const hourLabels = Array.from({ length: 8 }, (_, i) => i * 3);

  return (
    <section className="flex flex-col gap-3" aria-label="Week">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <WeekMonthLinks active="week" weekHref={weekHref(null)} monthHref={monthHref(date)} />
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
      <Legend primary={primary} context={context} />

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
                {day.summary}
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
              {day.bands.map((band) => (
                <div
                  key={band.key}
                  title={`${context.context.label} · ${band.detail}`}
                  className={cn(
                    "absolute inset-x-0 flex items-end justify-end overflow-hidden px-1 pb-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-500",
                    context.context.className,
                  )}
                  style={{
                    top: (band.fromSeconds / 3600) * PX_PER_HOUR,
                    height: ((band.toSeconds - band.fromSeconds) / 3600) * PX_PER_HOUR,
                  }}
                >
                  {band.toSeconds - band.fromSeconds >= 3600 && (
                    <span className="sr-only md:not-sr-only">{band.title}</span>
                  )}
                </div>
              ))}
              {day.blocks.map((block) => {
                const height = ((block.toSeconds - block.fromSeconds) / 3600) * PX_PER_HOUR;
                return (
                  <div
                    key={block.key}
                    className={cn(
                      "absolute inset-x-1.5 flex flex-col gap-px overflow-hidden rounded-[3px] px-1.5 py-0.5 text-[11px] leading-tight",
                      block.className,
                      block.raised && "z-[1]",
                    )}
                    style={{
                      top: (block.fromSeconds / 3600) * PX_PER_HOUR + 1,
                      height: Math.max(height - 2, 10),
                    }}
                  >
                    <span className="font-bold text-ink-900">{block.title}</span>
                    {height >= 30 && <span className="text-ink-700">{block.detail}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 md:hidden">
        {days.map((day) => {
          const rows = [
            ...day.blocks.map((block) => ({ ...block, faint: false })),
            ...day.bands.map((band) => ({ ...band, title: context.context.label, faint: true })),
          ].sort((a, b) => a.fromSeconds - b.fromSeconds);
          return (
            <section key={day.dateISO} aria-label={`${day.name} ${day.num}`}>
              <h3 className="mb-1.5 flex items-baseline gap-2 text-xs font-bold uppercase tracking-wider text-ink-500">
                {day.name} {day.num}
                {day.dateISO === today && (
                  <span className="normal-case tracking-normal text-brand-link">Today</span>
                )}
              </h3>
              {rows.length === 0 ? (
                <EmptyState compact className="max-w-none px-3 py-2">
                  {day.summary} all day.
                </EmptyState>
              ) : (
                <ul className="divide-y divide-line rounded border border-line">
                  {rows.map((row) => (
                    <li
                      key={`${row.faint ? "band" : "block"}-${row.key}`}
                      className={cn("flex gap-3 px-3 py-2.5 text-sm", row.faint && "text-ink-500")}
                    >
                      <span
                        className={cn("font-bold", row.faint ? "text-ink-500" : "text-ink-900")}
                      >
                        {row.title}
                      </span>
                      <span className="text-ink-700">{row.detail}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function MonthView({ date, today, primary, context, weekHref, monthHref }: HoursCalendarProps) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const first = `${date.slice(0, 7)}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leading = dayOfWeekISO(first);
  const previousMonth = shiftDateISO(first, -1).slice(0, 7) + "-01";
  const nextMonth = shiftDateISO(first, 31).slice(0, 7) + "-01";
  const cells = Array.from({ length: Math.ceil((leading + daysInMonth) / 7) * 7 }, (_, i) => {
    const day = i - leading + 1;
    if (day < 1 || day > daysInMonth) return null;
    const dateISO = `${date.slice(0, 7)}-${String(day).padStart(2, "0")}`;
    return {
      dateISO,
      day,
      summary: primary.summaryOn(dateISO),
      contextSummary: context.summaryOn(dateISO),
      change: primary.changeOn(dateISO),
    };
  });

  return (
    <section className="flex flex-col gap-3" aria-label="Month">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <WeekMonthLinks active="month" weekHref={weekHref(date)} monthHref={monthHref(date)} />
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
                <span className="text-[11px] text-ink-700 sm:text-xs">{cell.summary}</span>
                {cell.change && (
                  <span
                    className={cn(
                      "truncate text-[11px] font-semibold sm:text-xs",
                      cell.change.className,
                    )}
                  >
                    {cell.change.label}
                  </span>
                )}
                <span className="truncate text-[10px] text-ink-400 max-sm:hidden sm:text-[11px]">
                  {cell.contextSummary}
                </span>
              </Link>
            ),
          )}
        </div>
      </div>
      <p className="text-[13px] text-ink-500">{primary.monthNote}</p>
    </section>
  );
}
