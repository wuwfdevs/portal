import Link from "next/link";
import { cn } from "@/lib/cn";
import { blockReservesWindow } from "@/lib/bookings/agreements";
import {
  bookingIsLive,
  blackoutOn,
  classHoursOn,
  formatWindow,
  type BlackoutLike,
  type BookingLike,
  type CalendarReservedBlock,
  type CalendarState,
  type HoldLike,
} from "@/lib/bookings/scheduling";
import { formatDateShort } from "@/lib/log/program-status";
import { shiftDateISO, stationTodayISO } from "@/lib/log/timezone";
import { formatWeekRange, weekDates, weekStartISO } from "@/lib/log/week-layout";

/**
 * The production calendar's week and month pictures (docs/bookings-design.md
 * §4): one row per pool the term plan resources, one per labor class it
 * tracks, seven columns. A server component — navigation is links, every
 * write is a form elsewhere on the page. Unlike On Air's hours calendar
 * there is no hour axis: a pool's day holds a handful of windows, and a
 * block's label matters more than its exact height.
 */

export type CalendarView = "week" | "month";

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

/** A diagonal hatch — the mark for a window that is not available (On Air uses the same for closed hours). */
export const BLACKOUT_HATCH =
  "bg-[repeating-linear-gradient(135deg,rgba(166,52,52,0.18)_0_4px,rgba(255,255,255,0.85)_4px_9px)]";
export const BLOCK_CONFIRMED = "border border-[#2E6DA4] bg-[#DCEBF8] text-ink-900";
export const BLOCK_TENTATIVE = "border border-dashed border-[#2E6DA4] bg-white text-ink-900";
export const BLOCK_CORE = "border border-[#8A9099] bg-[#DCE1E6] text-ink-900";
export const BLOCK_MAINTENANCE =
  "border border-dashed border-warning-border bg-warning-bg text-warning-fg";
/** A window an agreement holds for its partner (slice 5): a dotted frame, no fill, until it is booked or released. */
export const BLOCK_RESERVED = "border border-dotted border-[#5A6B7D] bg-[#F4F6F8] text-ink-700";

export function Legend() {
  const items = [
    { label: "Confirmed booking", className: BLOCK_CONFIRMED },
    { label: "Tentative (an estimate's hold)", className: BLOCK_TENTATIVE },
    { label: "Core WUWF work", className: BLOCK_CORE },
    { label: "Maintenance", className: BLOCK_MAINTENANCE },
    { label: "Reserved under an agreement", className: BLOCK_RESERVED },
    { label: "Blacked out", className: cn("border border-[#B45454]", BLACKOUT_HATCH) },
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-700">
      {items.map((item) => (
        <span key={item.label}>
          <span
            aria-hidden="true"
            className={cn("mr-1.5 inline-block size-3 rounded-[2px] align-[-1px]", item.className)}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export interface CalendarGridProps {
  view: CalendarView;
  /** The selected date: its week, or its month. */
  date: string;
  today: string;
  state: CalendarState;
  /** Pools shown, in order (the pool filter). */
  poolIds: string[];
  weekHref: (dateISO: string) => string;
  monthHref: (dateISO: string) => string;
}

export function CalendarGrid(props: CalendarGridProps) {
  return props.view === "week" ? <WeekGrid {...props} /> : <MonthGrid {...props} />;
}

function ViewToggle({
  active,
  weekHref,
  monthHref,
}: {
  active: CalendarView;
  weekHref: string;
  monthHref: string;
}) {
  const base =
    "inline-flex h-9 items-center px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-900";
  const on = "bg-[#0F2235] text-white";
  const off = "bg-white text-ink-900 hover:bg-panel-50";
  return (
    <nav aria-label="View" className="inline-flex overflow-hidden rounded border border-[#C9CED4]">
      <Link
        href={weekHref}
        aria-current={active === "week" ? "page" : undefined}
        className={cn(base, active === "week" ? on : off)}
      >
        Week
      </Link>
      <Link
        href={monthHref}
        aria-current={active === "month" ? "page" : undefined}
        className={cn(base, "border-l border-[#C9CED4]", active === "month" ? on : off)}
      >
        Month
      </Link>
    </nav>
  );
}

const navLink =
  "rounded border border-[#C9CED4] px-2.5 py-1.5 text-sm font-semibold text-ink-900 hover:bg-panel-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900";

function Block({ className, title, detail }: { className: string; title: string; detail: string }) {
  return (
    <div className={cn("rounded-[3px] px-1.5 py-1 text-[11px] leading-tight", className)}>
      <span className="block font-bold">{title}</span>
      <span className="block">{detail}</span>
    </div>
  );
}

function holdClass(hold: HoldLike): string {
  return hold.kind === "core" ? BLOCK_CORE : BLOCK_MAINTENANCE;
}

function bookingClass(booking: BookingLike): string {
  return booking.status === "confirmed" ? BLOCK_CONFIRMED : BLOCK_TENTATIVE;
}

function dayItems(state: CalendarState, poolId: string, dateISO: string) {
  const blackout = blackoutOn(dateISO, poolId, state.blackouts);
  const holds = state.holds.filter((h) => h.pool_id === poolId && h.date === dateISO);
  const bookings = state.bookings.filter(
    (b) => b.pool_id === poolId && b.date === dateISO && bookingIsLive(b, state.nowISO),
  );
  // A reserved block still holding its window and not yet booked (a booked one shows as its booking).
  const today = stationTodayISO(state.nowISO);
  const reserved: CalendarReservedBlock[] = (state.reservedBlocks ?? []).filter(
    (rb) =>
      rb.pool_id === poolId &&
      rb.date === dateISO &&
      rb.project_id === null &&
      blockReservesWindow(
        rb,
        { status: rb.agreement_status, release_deadline_days: rb.release_deadline_days },
        today,
      ),
  );
  return { blackout, holds, bookings, reserved };
}

function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function WeekGrid({ date, today, state, poolIds, weekHref, monthHref }: CalendarGridProps) {
  const monday = weekStartISO(date);
  const dates = weekDates(date);
  const inPlan = (d: string) => d >= state.plan.starts_on && d <= state.plan.ends_on;
  const poolName = (id: string) => state.pools.find((p) => p.id === id)?.name ?? "Pool";

  return (
    <section className="flex flex-col gap-3" aria-label="Week">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <ViewToggle active="week" weekHref={weekHref(today)} monthHref={monthHref(date)} />
        <h3 className="text-[15px] font-semibold text-ink-900 max-sm:order-first max-sm:w-full">
          {formatWeekRange(monday)}
        </h3>
        <Link href={weekHref(shiftDateISO(monday, -7))} className={navLink}>
          <span aria-hidden="true">← </span>Prev<span className="sr-only"> week</span>
        </Link>
        <Link href={weekHref(shiftDateISO(monday, 7))} className={navLink}>
          Next<span className="sr-only"> week</span>
          <span aria-hidden="true"> →</span>
        </Link>
        <Link href={weekHref(today)} className={navLink}>
          Today
        </Link>
      </div>
      <Legend />

      <div className="overflow-x-auto rounded border border-line">
        <table className="w-full min-w-[840px] table-fixed border-collapse text-sm">
          <thead>
            <tr className="bg-panel-50">
              <th className="w-36 border-b border-line px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-ink-500">
                Resource
              </th>
              {dates.map((d, index) => (
                <th
                  key={d}
                  className={cn(
                    "border-b border-l border-line px-2 py-2 text-left text-xs font-bold uppercase tracking-wider",
                    d === today ? "text-brand-link" : "text-ink-500",
                    !inPlan(d) && "bg-[#F4F5F7] text-ink-400",
                  )}
                >
                  {DAY_NAMES[index]} {Number(d.slice(8))}
                  {d === today && <span className="normal-case tracking-normal"> · Today</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {poolIds.map((poolId) => {
              const resource = state.resources.find((r) => r.pool_id === poolId);
              const pool = state.pools.find((p) => p.id === poolId);
              return (
                <tr key={poolId} className="align-top">
                  <th
                    scope="row"
                    className="border-b border-line px-3 py-2 text-left text-[13px] font-semibold text-ink-900"
                  >
                    {poolName(poolId)}
                    {resource && (
                      <span className="block text-[11px] font-normal text-ink-500">
                        {trim(Number(resource.available_units))} {pool?.unit_label ?? "unit"}s this
                        term
                        {resource.concurrent_units > 1 &&
                          ` · ${resource.concurrent_units} at a time`}
                      </span>
                    )}
                  </th>
                  {dates.map((d) => {
                    const { blackout, holds, bookings, reserved } = dayItems(state, poolId, d);
                    const outside = !inPlan(d);
                    return (
                      <td
                        key={d}
                        title={blackout ? `Blacked out: ${blackout.reason}` : undefined}
                        className={cn(
                          "border-b border-l border-line px-1.5 py-1.5",
                          outside && "bg-[#F4F5F7]",
                          blackout && BLACKOUT_HATCH,
                        )}
                      >
                        <div className="flex min-h-[44px] flex-col gap-1">
                          {blackout && (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-[#8F3A3A]">
                              Blacked out
                            </span>
                          )}
                          {holds.map((hold) => (
                            <Block
                              key={hold.id}
                              className={holdClass(hold)}
                              title={hold.label}
                              detail={formatWindow(hold.window_start, hold.window_end)}
                            />
                          ))}
                          {bookings.map((booking) => (
                            <Block
                              key={booking.id}
                              className={bookingClass(booking)}
                              title={booking.label}
                              detail={`${formatWindow(booking.window_start, booking.window_end)}${
                                booking.status === "tentative" ? " · tentative" : ""
                              }`}
                            />
                          ))}
                          {reserved.map((rb) => (
                            <Block
                              key={rb.id}
                              className={BLOCK_RESERVED}
                              title={`Reserved: ${rb.partner_name}`}
                              detail={`${formatWindow(rb.window_start, rb.window_end)} · ${rb.agreement_label}`}
                            />
                          ))}
                          {!blackout &&
                            holds.length === 0 &&
                            bookings.length === 0 &&
                            reserved.length === 0 &&
                            !outside && <span className="text-[11px] text-ink-400">Open</span>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {state.capacity.map((row) => {
              const cls = state.classes.find((c) => c.id === row.labor_class_id);
              const cap = Number(row.headcount) * Number(row.hours_per_person_day);
              return (
                <tr key={row.labor_class_id} className="bg-panel-50/60 align-top">
                  <th
                    scope="row"
                    className="px-3 py-2 text-left text-[13px] font-semibold text-ink-900"
                  >
                    {cls?.name ?? "Labor"}
                    <span className="block text-[11px] font-normal text-ink-500">
                      {row.headcount > 1
                        ? `${row.headcount} × ${trim(Number(row.hours_per_person_day))} h a day`
                        : `${trim(Number(row.hours_per_person_day))} h a day`}
                    </span>
                  </th>
                  {dates.map((d) => {
                    const used = classHoursOn(
                      d,
                      row.labor_class_id,
                      state.holds,
                      state.bookings,
                      state.nowISO,
                    );
                    const share = cap > 0 ? Math.min(1, used / cap) : 0;
                    const laborOnly = state.holds.filter(
                      (h) =>
                        h.pool_id === null &&
                        h.date === d &&
                        (h.hours[row.labor_class_id] ?? 0) > 0,
                    );
                    return (
                      <td
                        key={d}
                        className={cn(
                          "border-l border-line px-2 py-2",
                          !inPlan(d) && "bg-[#F4F5F7]",
                        )}
                      >
                        <div className="text-[12px] font-semibold text-ink-900">
                          {trim(used)} / {trim(cap)} h
                        </div>
                        <div
                          aria-hidden="true"
                          className="mt-1 h-1.5 w-full overflow-hidden rounded bg-[#E3E7EB]"
                        >
                          <div
                            className={cn("h-full", share >= 1 ? "bg-[#B45454]" : "bg-[#2E6DA4]")}
                            style={{ width: `${share * 100}%` }}
                          />
                        </div>
                        {laborOnly.map((hold) => (
                          <div key={hold.id} className="mt-1 text-[11px] text-ink-700">
                            {hold.label} · {trim(Number(hold.hours[row.labor_class_id] ?? 0))} h
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MonthGrid({ date, today, state, poolIds, weekHref, monthHref }: CalendarGridProps) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const first = `${date.slice(0, 7)}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // Monday-first: Monday = 0.
  const leading = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const previousMonth = shiftDateISO(first, -1).slice(0, 7) + "-01";
  const nextMonth = shiftDateISO(first, 31).slice(0, 7) + "-01";
  const cells = Array.from({ length: Math.ceil((leading + daysInMonth) / 7) * 7 }, (_, i) => {
    const day = i - leading + 1;
    if (day < 1 || day > daysInMonth) return null;
    return `${date.slice(0, 7)}-${String(day).padStart(2, "0")}`;
  });

  const summarize = (d: string) => {
    const inPlan = d >= state.plan.starts_on && d <= state.plan.ends_on;
    let bookings = 0;
    let tentative = 0;
    let holds = 0;
    let reserved = 0;
    let blackout: BlackoutLike | null = null;
    for (const poolId of poolIds) {
      const items = dayItems(state, poolId, d);
      bookings += items.bookings.filter((b) => b.status === "confirmed").length;
      tentative += items.bookings.filter((b) => b.status === "tentative").length;
      holds += items.holds.length;
      reserved += items.reserved.length;
      blackout = blackout ?? items.blackout;
    }
    holds += state.holds.filter((h) => h.pool_id === null && h.date === d).length;
    return { inPlan, bookings, tentative, holds, reserved, blackout };
  };

  return (
    <section className="flex flex-col gap-3" aria-label="Month">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <ViewToggle active="month" weekHref={weekHref(today)} monthHref={monthHref(date)} />
        <h3 className="text-[15px] font-semibold text-ink-900 max-sm:order-first max-sm:w-full">
          {MONTH_NAMES[month - 1]} {year}
        </h3>
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
      <Legend />
      <div className="overflow-hidden rounded border border-line">
        <div className="grid grid-cols-7 border-b border-line bg-panel-50">
          {DAY_NAMES.map((name) => (
            <span
              key={name}
              className="px-2 py-2 text-xs font-bold uppercase tracking-wider text-ink-500"
            >
              {name}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, index) => {
            if (!d) {
              return (
                <div
                  key={`empty-${index}`}
                  className="min-h-[88px] border-b border-l border-line bg-[#F8F9FA]"
                />
              );
            }
            const summary = summarize(d);
            return (
              <Link
                key={d}
                href={weekHref(d)}
                className={cn(
                  "flex min-h-[88px] flex-col gap-0.5 border-b border-l border-line px-2 py-1.5 text-[12px] hover:bg-panel-50",
                  !summary.inPlan && "bg-[#F4F5F7] text-ink-400",
                  summary.blackout && BLACKOUT_HATCH,
                )}
                title={
                  summary.blackout
                    ? `Blacked out: ${summary.blackout.reason}`
                    : formatDateShort(d, true)
                }
              >
                <span
                  className={cn(
                    "text-[13px] font-bold",
                    d === today
                      ? "text-brand-link"
                      : summary.inPlan
                        ? "text-ink-900"
                        : "text-ink-400",
                  )}
                >
                  {Number(d.slice(8))}
                </span>
                {summary.bookings > 0 && (
                  <span className="text-ink-900">{summary.bookings} booked</span>
                )}
                {summary.tentative > 0 && (
                  <span className="text-ink-700">{summary.tentative} tentative</span>
                )}
                {summary.holds > 0 && <span className="text-ink-500">{summary.holds} held</span>}
                {summary.reserved > 0 && (
                  <span className="text-ink-500">{summary.reserved} reserved</span>
                )}
                {summary.blackout && (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#8F3A3A]">
                    Blacked out
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-ink-500">
        Each day counts its confirmed and tentative bookings and WUWF&apos;s holds. Pick a day to
        see its week.
      </p>
    </section>
  );
}
