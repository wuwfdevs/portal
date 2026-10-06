// The booking rule and the capacity arithmetic — pure, no Supabase, no React.
// docs/bookings-design.md §6.4 and §8. `bk_booking_allowed()` and
// `bk_check_booking_labor()` in 20261005160000_bookings_labor_and_pools.sql
// are this module's SQL twins: the triggers refuse, this module explains the
// refusal and proposes alternatives. Keep them in step.
//
// Capacity is per labor class (slice 2b): the term plan says, for each
// class it tracks, the net hours for the term, how many people, and each
// person's hours a day. A booking or a hold carries hours per class. A pool
// is one unit at a time unless its term resource says otherwise
// (`concurrent_units`). Dates are the station's calendar dates as ISO
// strings; times are "HH:MM".

import type { BkBookingStatus, BkHoldKind, BkPricingTreatment } from "@/lib/database.types";
import { shiftDateISO } from "@/lib/log/timezone";

export const HOURS_PER_PROJECT_DAY = 8;
/** §6.4: a tentative hold placed by an estimate expires with it. */
export const TENTATIVE_HOLD_DAYS = 14;
/** §6.4: a booking taking more than this share of a month's remaining open capacity warns. */
export const MONTH_WARNING_SHARE = 0.5;

/** Hours per labor class id. */
export type HoursByClass = Record<string, number>;

export interface TermPlanLike {
  starts_on: string;
  ends_on: string;
  reserve_share: number;
}

export interface CapacityLike {
  labor_class_id: string;
  net_hours: number;
  headcount: number;
  hours_per_person_day: number;
}

export interface LaborClassRef {
  id: string;
  name: string;
}

export interface ResourceWindow {
  key: string;
  label: string;
  /** "HH:MM" */
  start: string;
  end: string;
}

export interface ResourceLike {
  pool_id: string;
  available_units: number;
  concurrent_units: number;
  windows: ResourceWindow[];
}

export interface PoolRef {
  id: string;
  name: string;
  unit_label: string;
}

export interface BlackoutLike {
  id: string;
  starts_on: string;
  ends_on: string;
  pool_ids: string[] | null;
  reason: string;
}

export interface HoldLike {
  id: string;
  pool_id: string | null;
  date: string;
  window_start: string;
  window_end: string;
  kind: BkHoldKind;
  label: string;
  hours: HoursByClass;
}

export interface BookingLike {
  id: string;
  pool_id: string;
  date: string;
  window_start: string;
  window_end: string;
  treatment: BkPricingTreatment;
  status: BkBookingStatus;
  expires_at: string | null;
  label: string;
  hours: HoursByClass;
}

/** What a request asks the rule about: one window of one pool on one date, with its hours per class. */
export interface BookingRequest {
  pool_id: string;
  date: string;
  window_start: string;
  window_end: string;
  hours: HoursByClass;
  treatment: BkPricingTreatment;
  /** The booking being moved, if any — excluded from every count. */
  excludeBookingId?: string;
}

export interface CalendarState {
  plan: TermPlanLike;
  capacity: CapacityLike[];
  classes: LaborClassRef[];
  pools: PoolRef[];
  resources: ResourceLike[];
  blackouts: BlackoutLike[];
  holds: HoldLike[];
  bookings: BookingLike[];
  /** "Now", for expiring tentative holds. */
  nowISO: string;
}

// Windows ------------------------------------------------------------------------------------------------

/** The windows a pool offers when neither its catalog row nor the term resource set any. */
export const FALLBACK_WINDOWS: ResourceWindow[] = [
  { key: "am", label: "Morning", start: "08:00", end: "12:00" },
  { key: "pm", label: "Afternoon", start: "13:00", end: "17:00" },
  { key: "full", label: "Full day", start: "08:00", end: "17:00" },
];

const WINDOW_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The windows column (jsonb) as typed windows; malformed entries are dropped. */
export function parseWindows(value: unknown): ResourceWindow[] {
  if (!Array.isArray(value)) return [];
  const windows: ResourceWindow[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { key, label, start, end } = entry as Record<string, unknown>;
    if (typeof key !== "string" || typeof label !== "string") continue;
    if (typeof start !== "string" || typeof end !== "string") continue;
    if (!WINDOW_TIME.test(start) || !WINDOW_TIME.test(end) || start >= end) continue;
    windows.push({ key, label, start, end });
  }
  return windows;
}

/** "HH:MM" (or "HH:MM:SS") to minutes since midnight. */
export function timeToMinutes(time: string): number {
  const [h = "0", m = "0"] = time.split(":");
  return Number(h) * 60 + Number(m);
}

/** A time column value or "HH:MM" as "HH:MM". */
export function toHHMM(time: string): string {
  return time.slice(0, 5);
}

/** "8:00 AM – 12:00 PM" */
export function formatWindow(start: string, end: string): string {
  return `${formatClock(start)} – ${formatClock(end)}`;
}

export function formatClock(time: string): string {
  const minutes = timeToMinutes(time);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

export function windowsOverlap(
  a: { window_start: string; window_end: string },
  b: { window_start: string; window_end: string },
): boolean {
  return (
    timeToMinutes(a.window_start) < timeToMinutes(b.window_end) &&
    timeToMinutes(a.window_end) > timeToMinutes(b.window_start)
  );
}

// Counting --------------------------------------------------------------------------------------------------

/**
 * A booking still occupies its window: not released, not a project's planned
 * date (slice 3 — a plan before the estimate is sent takes nothing), and
 * not a tentative hold past its expiry. bk_booking_is_live() is the twin.
 */
export function bookingIsLive(booking: BookingLike, nowISO: string): boolean {
  if (booking.status === "released" || booking.status === "planned") return false;
  if (booking.status === "tentative" && booking.expires_at) {
    return Date.parse(booking.expires_at) > Date.parse(nowISO);
  }
  return true;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function hoursOf(item: { hours: HoursByClass }, classId: string): number {
  return Number(item.hours[classId] ?? 0);
}

/** The hours a booking or hold carries across every class. */
export function totalHours(hours: HoursByClass): number {
  return round2(Object.values(hours).reduce((total, value) => total + Number(value), 0));
}

export interface ClassCapacitySummary {
  labor_class_id: string;
  name: string;
  net: number;
  reserve: number;
  /** Strategic bookings against the reserve. */
  strategicBooked: number;
  reserveRemaining: number;
  /** WUWF's own holds (core work and maintenance). */
  held: number;
  /** Incremental and external bookings. */
  nonStrategicBooked: number;
  /** net − reserve − held − non-strategic bookings (§6.4 step 5). */
  open: number;
  /** Every live booking, for the "spoken for" figure. */
  booked: number;
  headcount: number;
  hoursPerPersonDay: number;
}

/** One class's envelope for the term (§8), from the plan and what already draws on it. */
export function classCapacity(
  state: Pick<CalendarState, "plan" | "capacity" | "classes" | "holds" | "bookings" | "nowISO">,
  classId: string,
  excludeBookingId?: string,
): ClassCapacitySummary | null {
  const capacity = state.capacity.find((row) => row.labor_class_id === classId);
  if (!capacity) return null;
  const live = state.bookings.filter(
    (b) => b.id !== excludeBookingId && bookingIsLive(b, state.nowISO),
  );
  const net = Number(capacity.net_hours);
  const reserve = round2(net * Number(state.plan.reserve_share));
  const strategicBooked = round2(
    live.filter((b) => b.treatment === "strategic").reduce((t, b) => t + hoursOf(b, classId), 0),
  );
  const nonStrategicBooked = round2(
    live.filter((b) => b.treatment !== "strategic").reduce((t, b) => t + hoursOf(b, classId), 0),
  );
  const held = round2(state.holds.reduce((t, h) => t + hoursOf(h, classId), 0));
  return {
    labor_class_id: classId,
    name: state.classes.find((cls) => cls.id === classId)?.name ?? "Labor",
    net,
    reserve,
    strategicBooked,
    reserveRemaining: round2(reserve - strategicBooked),
    held,
    nonStrategicBooked,
    open: round2(net - reserve - held - nonStrategicBooked),
    booked: round2(strategicBooked + nonStrategicBooked),
    headcount: Number(capacity.headcount),
    hoursPerPersonDay: Number(capacity.hours_per_person_day),
  };
}

/** Every tracked class's envelope, in the plan's order. */
export function capacitySummary(
  state: Pick<CalendarState, "plan" | "capacity" | "classes" | "holds" | "bookings" | "nowISO">,
  excludeBookingId?: string,
): ClassCapacitySummary[] {
  return state.capacity
    .map((row) => classCapacity(state, row.labor_class_id, excludeBookingId))
    .filter((row): row is ClassCapacitySummary => row !== null);
}

/** The classes summed, for the headline figures. */
export function totalCapacity(
  summaries: readonly ClassCapacitySummary[],
): Pick<
  ClassCapacitySummary,
  | "net"
  | "reserve"
  | "strategicBooked"
  | "reserveRemaining"
  | "held"
  | "nonStrategicBooked"
  | "open"
  | "booked"
> {
  const add = (pick: (row: ClassCapacitySummary) => number) =>
    round2(summaries.reduce((total, row) => total + pick(row), 0));
  return {
    net: add((r) => r.net),
    reserve: add((r) => r.reserve),
    strategicBooked: add((r) => r.strategicBooked),
    reserveRemaining: add((r) => r.reserveRemaining),
    held: add((r) => r.held),
    nonStrategicBooked: add((r) => r.nonStrategicBooked),
    open: add((r) => r.open),
    booked: add((r) => r.booked),
  };
}

/** Hours as "12 h" or "1.5 days (12 h)" — hours are the unit, days the reading. */
export function formatHours(hours: number): string {
  const rounded = round2(hours);
  const days = round2(rounded / HOURS_PER_PROJECT_DAY);
  if (Math.abs(rounded) < HOURS_PER_PROJECT_DAY) return `${trim(rounded)} h`;
  return `${trim(days)} ${Math.abs(days) === 1 ? "day" : "days"} (${trim(rounded)} h)`;
}

function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

/** A class's hours already spoken for on a date: live bookings plus holds. */
export function classHoursOn(
  dateISO: string,
  classId: string,
  holds: HoldLike[],
  bookings: BookingLike[],
  nowISO: string,
  excludeBookingId?: string,
): number {
  const fromBookings = bookings
    .filter((b) => b.date === dateISO && b.id !== excludeBookingId && bookingIsLive(b, nowISO))
    .reduce((t, b) => t + hoursOf(b, classId), 0);
  const fromHolds = holds
    .filter((h) => h.date === dateISO)
    .reduce((t, h) => t + hoursOf(h, classId), 0);
  return round2(fromBookings + fromHolds);
}

// The rule --------------------------------------------------------------------------------------------------

export type BookingRefusal =
  | { reason: "outside_plan"; message: string }
  | { reason: "no_resource"; message: string }
  | { reason: "blacked_out"; message: string; blackout: BlackoutLike }
  | { reason: "held"; message: string; hold: HoldLike }
  | { reason: "window_taken"; message: string; taken: number; concurrentUnits: number }
  | { reason: "day_full"; message: string; classId: string; remaining: number }
  | { reason: "reserve_exhausted"; message: string; classId: string; remaining: number }
  | { reason: "open_capacity_exhausted"; message: string; classId: string; remaining: number };

export interface OpenAlternative {
  date: string;
  window_start: string;
  window_end: string;
  label: string;
}

export type BookingCheck =
  | { ok: true; warnings: string[] }
  | { ok: false; refusal: BookingRefusal; alternatives: OpenAlternative[] };

/**
 * §6.4 for one date, in its order: blackout or hold; the window's concurrent
 * units free (tentative counted as taken); room in each class's day; each
 * class's capacity for the pricing treatment. Step 2 (a reserved block for
 * another partner) arrives with agreements in slice 5. The month-level
 * warning is TypeScript only.
 */
export function checkBooking(request: BookingRequest, state: CalendarState): BookingCheck {
  const refusal = findRefusal(request, state);
  if (refusal) {
    return { ok: false, refusal, alternatives: nextOpenWindows(request, state) };
  }
  const warnings: string[] = [];
  const monthWarning = monthShareWarning(request, state);
  if (monthWarning) warnings.push(monthWarning);
  return { ok: true, warnings };
}

function className(state: Pick<CalendarState, "classes">, classId: string): string {
  return state.classes.find((cls) => cls.id === classId)?.name ?? "Labor";
}

function findRefusal(request: BookingRequest, state: CalendarState): BookingRefusal | null {
  const { plan } = state;
  if (request.date < plan.starts_on || request.date > plan.ends_on) {
    return {
      reason: "outside_plan",
      message: `The date is outside the term plan (${plan.starts_on} to ${plan.ends_on}).`,
    };
  }
  const resource = state.resources.find((r) => r.pool_id === request.pool_id);
  if (!resource) {
    return { reason: "no_resource", message: "The term plan has no resource for that pool." };
  }

  // 1. Blacked out?
  const blackout = blackoutOn(request.date, request.pool_id, state.blackouts);
  if (blackout) {
    return {
      reason: "blacked_out",
      message: `Blacked out: ${blackout.reason} (${blackout.starts_on} to ${blackout.ends_on}).`,
      blackout,
    };
  }

  // 1 and 3. The window's concurrent units: holds and live bookings on the pool that overlap.
  const holds = state.holds.filter(
    (h) => h.pool_id === request.pool_id && h.date === request.date && windowsOverlap(h, request),
  );
  const bookings = state.bookings.filter(
    (b) =>
      b.id !== request.excludeBookingId &&
      b.pool_id === request.pool_id &&
      b.date === request.date &&
      bookingIsLive(b, state.nowISO) &&
      windowsOverlap(b, request),
  );
  const taken = holds.length + bookings.length;
  if (taken >= resource.concurrent_units) {
    const hold = holds[0];
    if (hold && resource.concurrent_units === 1) {
      return {
        reason: "held",
        message: `Held for WUWF: ${hold.label} (${formatWindow(hold.window_start, hold.window_end)}).`,
        hold,
      };
    }
    const first = bookings[0];
    return {
      reason: "window_taken",
      message:
        resource.concurrent_units === 1 && first
          ? `Already booked: ${first.label} (${formatWindow(first.window_start, first.window_end)}, ${first.status}).`
          : `The window is taken: ${taken} of ${resource.concurrent_units} on this pool already booked or held.`,
      taken,
      concurrentUnits: resource.concurrent_units,
    };
  }

  // 4 and 5, per class the plan tracks.
  for (const [classId, hours] of Object.entries(request.hours)) {
    const asked = Number(hours);
    if (asked <= 0) continue;
    const capacity = state.capacity.find((row) => row.labor_class_id === classId);
    if (!capacity) continue;
    const name = className(state, classId);

    const dayCap = round2(Number(capacity.headcount) * Number(capacity.hours_per_person_day));
    const dayHours = classHoursOn(
      request.date,
      classId,
      state.holds,
      state.bookings,
      state.nowISO,
      request.excludeBookingId,
    );
    const dayRemaining = round2(dayCap - dayHours);
    if (asked > dayRemaining) {
      return {
        reason: "day_full",
        message: `${name}: ${trim(dayRemaining)} of ${trim(dayCap)} hours left on this day; this needs ${trim(asked)}. Move prep or edit hours to a neighbouring day.`,
        classId,
        remaining: dayRemaining,
      };
    }

    const summary = classCapacity(state, classId, request.excludeBookingId)!;
    if (request.treatment === "strategic") {
      if (asked > summary.reserveRemaining) {
        return {
          reason: "reserve_exhausted",
          message: `The ${name} reserve has ${trim(summary.reserveRemaining)} of ${trim(summary.reserve)} hours left; this strategic booking needs ${trim(asked)}.`,
          classId,
          remaining: summary.reserveRemaining,
        };
      }
    } else if (asked > summary.open) {
      return {
        reason: "open_capacity_exhausted",
        message: `Open ${name} capacity has ${trim(summary.open)} hours left; this ${request.treatment} booking needs ${trim(asked)}.`,
        classId,
        remaining: summary.open,
      };
    }
  }
  return null;
}

export function blackoutOn(
  dateISO: string,
  poolId: string,
  blackouts: BlackoutLike[],
): BlackoutLike | null {
  return (
    blackouts.find(
      (b) =>
        dateISO >= b.starts_on &&
        dateISO <= b.ends_on &&
        (b.pool_ids === null || b.pool_ids.includes(poolId)),
    ) ?? null
  );
}

/** The windows a term resource offers: its own, else the fallback set. */
export function windowsFor(
  resource: ResourceLike | undefined,
  defaults?: ResourceWindow[],
): ResourceWindow[] {
  if (resource && resource.windows.length > 0) return resource.windows;
  if (defaults && defaults.length > 0) return defaults;
  return FALLBACK_WINDOWS;
}

/**
 * The next open windows on the same resource, nearest the asked date first
 * (the asked date's other windows, then the following days, then earlier
 * ones), within the term and only where the whole rule would pass.
 */
export function nextOpenWindows(
  request: BookingRequest,
  state: CalendarState,
  limit = 3,
  searchDays = 21,
): OpenAlternative[] {
  const resource = state.resources.find((r) => r.pool_id === request.pool_id);
  if (!resource) return [];
  const windows = windowsFor(resource);
  const offsets: number[] = [0];
  for (let day = 1; day <= searchDays; day += 1) offsets.push(day, -day);
  const found: OpenAlternative[] = [];
  for (const offset of offsets) {
    const date = shiftDateISO(request.date, offset);
    if (date < state.plan.starts_on || date > state.plan.ends_on) continue;
    for (const window of windows) {
      if (
        offset === 0 &&
        window.start === toHHMM(request.window_start) &&
        window.end === toHHMM(request.window_end)
      ) {
        continue;
      }
      const candidate: BookingRequest = {
        ...request,
        date,
        window_start: window.start,
        window_end: window.end,
      };
      if (findRefusal(candidate, state) === null) {
        found.push({
          date,
          window_start: window.start,
          window_end: window.end,
          label: window.label,
        });
        if (found.length >= limit) return found;
      }
    }
  }
  return found;
}

// Months ----------------------------------------------------------------------------------------------------

export interface MonthCapacity {
  /** "YYYY-MM" */
  month: string;
  /** Days of the term in this month. */
  days: number;
  /** This month's share of the term's open capacity across tracked classes, by days. */
  openShare: number;
  /** Non-strategic hours already booked in this month, across tracked classes. */
  nonStrategicBooked: number;
  /** Open hours still available in this month. */
  openRemaining: number;
}

/** §6.4: the term plan spreads open capacity by month, pro rata by days in the term. */
export function monthlyCapacity(state: CalendarState, excludeBookingId?: string): MonthCapacity[] {
  const { plan } = state;
  const tracked = new Set(state.capacity.map((row) => row.labor_class_id));
  const openBeforeBookings = totalCapacity(capacitySummary({ ...state, bookings: [] })).open;
  const dayCounts = new Map<string, number>();
  let totalDays = 0;
  for (let date = plan.starts_on; date <= plan.ends_on; date = shiftDateISO(date, 1)) {
    const month = date.slice(0, 7);
    dayCounts.set(month, (dayCounts.get(month) ?? 0) + 1);
    totalDays += 1;
  }
  const live = state.bookings.filter(
    (b) =>
      b.id !== excludeBookingId && b.treatment !== "strategic" && bookingIsLive(b, state.nowISO),
  );
  const trackedHours = (b: BookingLike) =>
    Object.entries(b.hours).reduce(
      (total, [classId, hours]) => total + (tracked.has(classId) ? Number(hours) : 0),
      0,
    );
  return [...dayCounts.entries()].map(([month, days]) => {
    const openShare = totalDays === 0 ? 0 : round2((openBeforeBookings * days) / totalDays);
    const booked = round2(
      live.filter((b) => b.date.startsWith(month)).reduce((t, b) => t + trackedHours(b), 0),
    );
    return {
      month,
      days,
      openShare,
      nonStrategicBooked: booked,
      openRemaining: round2(openShare - booked),
    };
  });
}

/**
 * §6.4: an incremental or external booking that would take more than half
 * of its month's remaining open capacity warns, never blocks — so January
 * cannot quietly sell April. Strategic bookings draw the reserve, not open
 * capacity, and never warn here.
 */
export function monthShareWarning(request: BookingRequest, state: CalendarState): string | null {
  if (request.treatment === "strategic") return null;
  const tracked = new Set(state.capacity.map((row) => row.labor_class_id));
  const asked = round2(
    Object.entries(request.hours).reduce(
      (total, [classId, hours]) => total + (tracked.has(classId) ? Number(hours) : 0),
      0,
    ),
  );
  if (asked <= 0) return null;
  const month = monthlyCapacity(state, request.excludeBookingId).find(
    (m) => m.month === request.date.slice(0, 7),
  );
  if (!month || month.openRemaining <= 0) return null;
  if (asked > month.openRemaining * MONTH_WARNING_SHARE) {
    return `This takes ${trim(asked)} of the ${trim(month.openRemaining)} open hours left in ${formatMonth(month.month)} — more than half. Check that the month is not being sold out early.`;
  }
  return null;
}

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

export function formatMonth(month: string): string {
  const [year, index] = month.split("-");
  return `${MONTH_NAMES[Number(index) - 1]} ${year}`;
}

/** The expiry an estimate's tentative hold gets when placed at `nowISO`. */
export function tentativeExpiry(nowISO: string, days = TENTATIVE_HOLD_DAYS): string {
  return new Date(Date.parse(nowISO) + days * 86_400_000).toISOString();
}

// The resource form ------------------------------------------------------------------------------

const WINDOW_LINE = /^(.*?)\s+(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})$/;

/** The resource form's windows, one per line: "Morning 08:00–12:00". */
export function parseWindowLines(
  text: string,
): { ok: true; windows: ResourceWindow[] } | { ok: false; error: string } {
  const windows: ResourceWindow[] = [];
  const keys = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = WINDOW_LINE.exec(line);
    if (!match) {
      return {
        ok: false,
        error: `"${line}" is not a window. Write a label and times, such as "Morning 08:00–12:00".`,
      };
    }
    const label = match[1]!;
    const start = match[2]!;
    const end = match[3]!;
    if (!WINDOW_TIME.test(start) || !WINDOW_TIME.test(end) || end <= start) {
      return { ok: false, error: `"${line}" needs a start before its end, in 24-hour time.` };
    }
    let key = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!key) key = `w${windows.length + 1}`;
    while (keys.has(key)) key = `${key}-2`;
    keys.add(key);
    windows.push({ key, label, start, end });
  }
  return { ok: true, windows };
}

/** The inverse of parseWindowLines, for the form's default value. */
export function formatWindowLines(windows: ResourceWindow[]): string {
  return windows.map((w) => `${w.label} ${w.start}–${w.end}`).join("\n");
}

/** Hours-per-class rows (a form's or a table's) as the record the rule reads; zero and unknown rows dropped. */
export function hoursByClass(
  rows: readonly { labor_class_id: string; hours: number }[],
): HoursByClass {
  const record: HoursByClass = {};
  for (const row of rows) {
    const hours = Number(row.hours);
    if (hours > 0) record[row.labor_class_id] = round2((record[row.labor_class_id] ?? 0) + hours);
  }
  return record;
}
