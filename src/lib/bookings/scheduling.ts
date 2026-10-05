// The booking rule and the capacity arithmetic — pure, no Supabase, no React.
// docs/bookings-design.md §6.4 and §8. `bk_booking_allowed()` in
// 20261005150000_bookings_term_plan.sql is this module's SQL twin: the
// trigger refuses, this module explains the refusal and proposes
// alternatives. Keep the two in step.
//
// Hours are professional hours throughout (§2.1: a project day is 8). Dates
// are the station's calendar dates as ISO strings; times are "HH:MM".

import type { BkBookingStatus, BkHoldKind, BkPricingTreatment } from "@/lib/database.types";
import { shiftDateISO } from "@/lib/log/timezone";
import type { PoolKey } from "./rates";

export const HOURS_PER_PROJECT_DAY = 8;
/** §6.4: a tentative hold placed by an estimate expires with it. */
export const TENTATIVE_HOLD_DAYS = 14;
/** §6.4: a booking taking more than this share of a month's remaining open capacity warns. */
export const MONTH_WARNING_SHARE = 0.5;

export interface TermPlanLike {
  starts_on: string;
  ends_on: string;
  net_professional_hours: number;
  reserve_share: number;
  lead_hours_per_day: number;
}

export interface ResourceWindow {
  key: string;
  label: string;
  /** "HH:MM" */
  start: string;
  end: string;
}

export interface ResourceLike {
  pool: PoolKey;
  available_units: number;
  unit_label: string;
  windows: ResourceWindow[];
}

export interface BlackoutLike {
  id: string;
  starts_on: string;
  ends_on: string;
  pools: PoolKey[] | null;
  reason: string;
}

export interface HoldLike {
  id: string;
  pool: PoolKey | null;
  date: string;
  window_start: string;
  window_end: string;
  professional_hours: number;
  kind: BkHoldKind;
  label: string;
}

export interface BookingLike {
  id: string;
  pool: PoolKey;
  date: string;
  window_start: string;
  window_end: string;
  professional_hours: number;
  treatment: BkPricingTreatment;
  status: BkBookingStatus;
  expires_at: string | null;
  label: string;
}

/** What a request asks the rule about: one window of one pool on one date. */
export interface BookingRequest {
  pool: PoolKey;
  date: string;
  window_start: string;
  window_end: string;
  professional_hours: number;
  treatment: BkPricingTreatment;
  /** The booking being moved, if any — excluded from every count. */
  excludeBookingId?: string;
}

export interface CalendarState {
  plan: TermPlanLike;
  resources: ResourceLike[];
  blackouts: BlackoutLike[];
  holds: HoldLike[];
  bookings: BookingLike[];
  /** "Now", for expiring tentative holds. */
  nowISO: string;
}

// Windows ------------------------------------------------------------------------------------------------

/** The windows a pool offers when the director has not set any (§5). */
export const DEFAULT_WINDOWS: Record<PoolKey, ResourceWindow[]> = {
  studio: [
    { key: "am", label: "Morning", start: "08:00", end: "12:00" },
    { key: "pm", label: "Afternoon", start: "13:00", end: "17:00" },
    { key: "full", label: "Full day", start: "08:00", end: "17:00" },
    { key: "evening", label: "Evening", start: "17:00", end: "21:00" },
  ],
  field: [{ key: "day", label: "Day", start: "08:00", end: "17:00" }],
  live: [{ key: "day", label: "Day", start: "08:00", end: "17:00" }],
  edit: [
    { key: "am", label: "Morning", start: "08:00", end: "12:00" },
    { key: "pm", label: "Afternoon", start: "13:00", end: "17:00" },
  ],
};

export const DEFAULT_UNIT_LABEL: Record<PoolKey, string> = {
  studio: "half-days",
  field: "days",
  live: "days",
  edit: "hours",
};

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

/** A booking still occupies its window: not released, and not a tentative hold past its expiry. */
export function bookingIsLive(booking: BookingLike, nowISO: string): boolean {
  if (booking.status === "released") return false;
  if (booking.status === "tentative" && booking.expires_at) {
    return Date.parse(booking.expires_at) > Date.parse(nowISO);
  }
  return true;
}

export interface CapacitySummary {
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
}

/** The term's production envelope (§8), from the plan and what already draws on it. */
export function capacitySummary(
  plan: TermPlanLike,
  holds: Pick<HoldLike, "professional_hours">[],
  bookings: BookingLike[],
  nowISO: string,
  excludeBookingId?: string,
): CapacitySummary {
  const live = bookings.filter((b) => b.id !== excludeBookingId && bookingIsLive(b, nowISO));
  const net = Number(plan.net_professional_hours);
  const reserve = round2(net * Number(plan.reserve_share));
  const strategicBooked = round2(sum(live.filter((b) => b.treatment === "strategic")));
  const nonStrategicBooked = round2(sum(live.filter((b) => b.treatment !== "strategic")));
  const held = round2(holds.reduce((total, hold) => total + Number(hold.professional_hours), 0));
  return {
    net,
    reserve,
    strategicBooked,
    reserveRemaining: round2(reserve - strategicBooked),
    held,
    nonStrategicBooked,
    open: round2(net - reserve - held - nonStrategicBooked),
    booked: round2(strategicBooked + nonStrategicBooked),
  };
}

function sum(bookings: Pick<BookingLike, "professional_hours">[]): number {
  return bookings.reduce((total, booking) => total + Number(booking.professional_hours), 0);
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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

/** The lead's hours already spoken for on a date: live bookings plus holds. */
export function leadHoursOn(
  dateISO: string,
  holds: HoldLike[],
  bookings: BookingLike[],
  nowISO: string,
  excludeBookingId?: string,
): number {
  const fromBookings = sum(
    bookings.filter(
      (b) => b.date === dateISO && b.id !== excludeBookingId && bookingIsLive(b, nowISO),
    ),
  );
  const fromHolds = holds
    .filter((h) => h.date === dateISO)
    .reduce((total, hold) => total + Number(hold.professional_hours), 0);
  return round2(fromBookings + fromHolds);
}

// The rule --------------------------------------------------------------------------------------------------

export type BookingRefusal =
  | { reason: "outside_plan"; message: string }
  | { reason: "no_resource"; message: string }
  | { reason: "blacked_out"; message: string; blackout: BlackoutLike }
  | { reason: "held"; message: string; hold: HoldLike }
  | { reason: "window_taken"; message: string; booking: BookingLike }
  | { reason: "lead_day_full"; message: string; remaining: number }
  | { reason: "reserve_exhausted"; message: string; remaining: number }
  | { reason: "open_capacity_exhausted"; message: string; remaining: number };

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
 * §6.4 for one date, in its order: blackout or hold; window free (tentative
 * counted as taken); room in the lead's day; capacity for the pricing
 * treatment. Step 2 (a reserved block for another partner) arrives with
 * agreements in slice 5. The month-level warning is TypeScript only.
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

function findRefusal(request: BookingRequest, state: CalendarState): BookingRefusal | null {
  const { plan } = state;
  if (request.date < plan.starts_on || request.date > plan.ends_on) {
    return {
      reason: "outside_plan",
      message: `The date is outside the term plan (${plan.starts_on} to ${plan.ends_on}).`,
    };
  }
  if (!state.resources.some((r) => r.pool === request.pool)) {
    return {
      reason: "no_resource",
      message: `The term plan has no ${request.pool} resource to book.`,
    };
  }

  // 1. Blacked out?
  const blackout = blackoutOn(request.date, request.pool, state.blackouts);
  if (blackout) {
    return {
      reason: "blacked_out",
      message: `Blacked out: ${blackout.reason} (${blackout.starts_on} to ${blackout.ends_on}).`,
      blackout,
    };
  }

  // 1 and 3. A WUWF hold on the window?
  const hold = state.holds.find(
    (h) => h.pool === request.pool && h.date === request.date && windowsOverlap(h, request),
  );
  if (hold) {
    return {
      reason: "held",
      message: `Held for WUWF: ${hold.label} (${formatWindow(hold.window_start, hold.window_end)}).`,
      hold,
    };
  }

  // 3. Window free? Tentative holds are taken until they expire.
  const taken = state.bookings.find(
    (b) =>
      b.id !== request.excludeBookingId &&
      b.pool === request.pool &&
      b.date === request.date &&
      bookingIsLive(b, state.nowISO) &&
      windowsOverlap(b, request),
  );
  if (taken) {
    return {
      reason: "window_taken",
      message: `Already booked: ${taken.label} (${formatWindow(taken.window_start, taken.window_end)}, ${taken.status}).`,
      booking: taken,
    };
  }

  // 4. Room in the lead's day?
  const dayHours = leadHoursOn(
    request.date,
    state.holds,
    state.bookings,
    state.nowISO,
    request.excludeBookingId,
  );
  const dayRemaining = round2(Number(plan.lead_hours_per_day) - dayHours);
  if (request.professional_hours > dayRemaining) {
    return {
      reason: "lead_day_full",
      message: `The lead's day has ${trim(dayRemaining)} of ${trim(Number(plan.lead_hours_per_day))} hours left; this needs ${trim(request.professional_hours)}. Move prep or edit hours to a neighbouring day.`,
      remaining: dayRemaining,
    };
  }

  // 5. Capacity for its pricing?
  const capacity = capacitySummary(
    plan,
    state.holds,
    state.bookings,
    state.nowISO,
    request.excludeBookingId,
  );
  if (request.treatment === "strategic") {
    if (request.professional_hours > capacity.reserveRemaining) {
      return {
        reason: "reserve_exhausted",
        message: `The reserve has ${trim(capacity.reserveRemaining)} of ${trim(capacity.reserve)} hours left; this strategic booking needs ${trim(request.professional_hours)}.`,
        remaining: capacity.reserveRemaining,
      };
    }
  } else if (request.professional_hours > capacity.open) {
    return {
      reason: "open_capacity_exhausted",
      message: `Open capacity has ${trim(capacity.open)} hours left; this ${request.treatment} booking needs ${trim(request.professional_hours)}.`,
      remaining: capacity.open,
    };
  }
  return null;
}

export function blackoutOn(
  dateISO: string,
  pool: PoolKey,
  blackouts: BlackoutLike[],
): BlackoutLike | null {
  return (
    blackouts.find(
      (b) =>
        dateISO >= b.starts_on &&
        dateISO <= b.ends_on &&
        (b.pools === null || b.pools.includes(pool)),
    ) ?? null
  );
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
  const resource = state.resources.find((r) => r.pool === request.pool);
  if (!resource) return [];
  const windows = resource.windows.length > 0 ? resource.windows : DEFAULT_WINDOWS[request.pool];
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
  /** This month's share of the term's open capacity, by days. */
  openShare: number;
  /** Non-strategic hours already booked in this month. */
  nonStrategicBooked: number;
  /** Open hours still available in this month. */
  openRemaining: number;
}

/** §6.4: the term plan spreads open capacity by month, pro rata by days in the term. */
export function monthlyCapacity(state: CalendarState, excludeBookingId?: string): MonthCapacity[] {
  const { plan } = state;
  const totalOpenBeforeBookings = capacitySummary(plan, state.holds, [], state.nowISO).open;
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
  return [...dayCounts.entries()].map(([month, days]) => {
    const openShare = totalDays === 0 ? 0 : round2((totalOpenBeforeBookings * days) / totalDays);
    const booked = round2(sum(live.filter((b) => b.date.startsWith(month))));
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
  if (request.treatment === "strategic" || request.professional_hours <= 0) return null;
  const month = monthlyCapacity(state, request.excludeBookingId).find(
    (m) => m.month === request.date.slice(0, 7),
  );
  if (!month || month.openRemaining <= 0) return null;
  if (request.professional_hours > month.openRemaining * MONTH_WARNING_SHARE) {
    return `This takes ${trim(request.professional_hours)} of the ${trim(month.openRemaining)} open hours left in ${formatMonth(month.month)} — more than half. Check that the month is not being sold out early.`;
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
