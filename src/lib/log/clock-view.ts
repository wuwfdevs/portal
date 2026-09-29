// Pure model behind the clock page's Timeline and Ring views — no Supabase
// import, colocated test. Both views draw the same thing: one hour of a clock
// version, as network slots plus WUWF's local-opportunity overlay, with one
// selected slot, an hour-of-the-shift stepper (the clock repeats every hour a
// multi-hour program airs, but pinned content can differ by hour), and floating
// breaks. Keeping the model here means the two views can't drift.

import { categorizeSlot } from "@/lib/log/clock-face";
import type { LogOpportunityRequirement, LogSlotTimingMode } from "@/lib/database.types";

export const HOUR_SECONDS = 3600;

/** What a network slot looks like: a deliberately small palette (docs: the clock view uses neutrals plus one accent for anything local). */
export type SlotVisualKind = "segment" | "newscast" | "promo" | "silence";

export const SLOT_VISUAL_COLORS: Record<SlotVisualKind, { fill: string; border: string }> = {
  segment: { fill: "#E4E8ED", border: "#C2C9D1" },
  newscast: { fill: "#0F2235", border: "#0F2235" },
  promo: { fill: "#B8C4D0", border: "#9AA9B8" },
  silence: { fill: "#F1F3F5", border: "#D5DAE0" },
};

export const SLOT_VISUAL_LABEL: Record<SlotVisualKind, string> = {
  segment: "Segment",
  newscast: "Newscast",
  promo: "Promo and credits",
  silence: "Silence",
};

export interface ClockSlotInput {
  id: string;
  position: number;
  label: string | null;
  segment_label: string | null;
  timing_mode: LogSlotTimingMode;
  start_offset_seconds: number | null;
  duration_seconds: number;
  earliest_start_offset_seconds: number | null;
  latest_start_offset_seconds: number | null;
}

/** Newscast, promo-and-credits (promos, billboards, music beds, funding credits), silence, or plain program segment. */
export function slotVisualKind(slot: {
  label: string | null;
  segment_label: string | null;
  timing_mode: LogSlotTimingMode;
}): SlotVisualKind {
  const category = categorizeSlot(slot);
  if (category === "newscast") return "newscast";
  if (category === "promo" || category === "music" || category === "credit") return "promo";
  if (/silence/i.test(slot.label ?? "")) return "silence";
  return "segment";
}

/** "12:00", "12:30" — minutes and seconds into the hour. */
export function formatOffsetSeconds(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

/** "12:00" or "12:00–12:30" when the two ends differ. */
export function formatOffsetRange(low: number, high: number): string {
  return low === high
    ? formatOffsetSeconds(low)
    : `${formatOffsetSeconds(low)}–${formatOffsetSeconds(high)}`;
}

/** A slot's own label, falling back to its segment letter and then a generic name. */
export function slotDisplayLabel(slot: {
  label: string | null;
  segment_label: string | null;
}): string {
  if (slot.label && slot.label.trim() !== "") return slot.label;
  if (slot.segment_label) return `Segment ${slot.segment_label}`;
  return "Slot";
}

/**
 * A floating slot: each edge may move within a range, and an edge that is not
 * given a range is fixed. Today's schema stores a start window plus one fixed
 * duration, so both edges move together (`floatWindowFromSlot`); the shape
 * already allows "the end stays put while the start floats" — the case an
 * interview segment produces — for when the schema can say so.
 */
export interface FloatWindow {
  startEarliest: number;
  startLatest: number;
  endEarliest: number;
  endLatest: number;
  startMoves: boolean;
  endMoves: boolean;
  /** Shortest and longest the break can be. */
  lengthMin: number;
  lengthMax: number;
}

export function makeFloatWindow(range: {
  startEarliest: number;
  startLatest: number;
  endEarliest: number;
  endLatest: number;
}): FloatWindow {
  return {
    ...range,
    startMoves: range.startEarliest !== range.startLatest,
    endMoves: range.endEarliest !== range.endLatest,
    lengthMin: Math.max(0, range.endEarliest - range.startLatest),
    lengthMax: range.endLatest - range.startEarliest,
  };
}

/** The window of a float slot, or null when it isn't one (or lacks its bounds). */
export function floatWindowFromSlot(slot: ClockSlotInput): FloatWindow | null {
  if (
    slot.timing_mode !== "float" ||
    slot.earliest_start_offset_seconds === null ||
    slot.latest_start_offset_seconds === null
  ) {
    return null;
  }
  return makeFloatWindow({
    startEarliest: slot.earliest_start_offset_seconds,
    startLatest: slot.latest_start_offset_seconds,
    endEarliest: slot.earliest_start_offset_seconds + slot.duration_seconds,
    endLatest: slot.latest_start_offset_seconds + slot.duration_seconds,
  });
}

export function describeFloatWhen(window: FloatWindow): string {
  return `starts ${formatOffsetRange(window.startEarliest, window.startLatest)} · ends ${formatOffsetRange(window.endEarliest, window.endLatest)}`;
}

export function describeFloatLength(window: FloatWindow): string {
  return formatOffsetRange(window.lengthMin, window.lengthMax);
}

/** The sentence the selected-slot panel shows for a floating break. */
export function describeFloatNote(window: FloatWindow): string {
  const length = describeFloatLength(window);
  const always = " The darker area is always part of the break.";
  if (window.startMoves && !window.endMoves) {
    return `Starts anywhere from ${formatOffsetSeconds(window.startEarliest)} to ${formatOffsetSeconds(window.startLatest)} and always ends at ${formatOffsetSeconds(window.endLatest)}, so it lasts ${length}. The segment before it, an interview, ends when the break starts, so it can run long.${always}`;
  }
  if (!window.startMoves && window.endMoves) {
    return `Always starts at ${formatOffsetSeconds(window.startEarliest)} and ends anywhere from ${formatOffsetSeconds(window.endEarliest)} to ${formatOffsetSeconds(window.endLatest)}, so it lasts ${length}.${always}`;
  }
  if (!window.startMoves && !window.endMoves) {
    return `Fixed from ${formatOffsetSeconds(window.startEarliest)} to ${formatOffsetSeconds(window.endLatest)}.`;
  }
  return `Starts between ${formatOffsetSeconds(window.startEarliest)} and ${formatOffsetSeconds(window.startLatest)} and ends between ${formatOffsetSeconds(window.endEarliest)} and ${formatOffsetSeconds(window.endLatest)}, so it lasts ${length}.${always}`;
}

export interface ClockOpportunityInput {
  id: string;
  slot_id: string;
  requirement: LogOpportunityRequirement;
}

export interface ClockPinInput {
  id: string;
  local_opportunity_id: string;
  hour_index: number | null;
  days_of_week: number[];
  title: string;
}

/** Whether a pin applies to the given zero-based hour of the shift (null = every hour). */
export function pinAppliesToHour(pin: { hour_index: number | null }, hourIndex: number): boolean {
  return pin.hour_index === null || pin.hour_index === hourIndex;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Every day · every hour", "Fri · second hour of the shift" — how a pin says when it applies. */
export function describePinScope(pin: {
  hour_index: number | null;
  days_of_week: number[];
}): string {
  const days =
    pin.days_of_week.length === 0 || pin.days_of_week.length === 7
      ? "Every day"
      : [...pin.days_of_week]
          .sort((a, b) => a - b)
          .map((day) => DAY_NAMES[day] ?? String(day))
          .join(", ");
  const hour = pin.hour_index === null ? "every hour" : `hour ${pin.hour_index + 1} of the shift`;
  return `${days} · ${hour}`;
}

export interface ClockViewSlot {
  id: string;
  label: string;
  kind: SlotVisualKind;
  /** Where the slot starts on the hour; a float slot's is its earliest start. */
  startSeconds: number;
  /** A float slot's is its longest possible length. */
  durationSeconds: number;
  float: FloatWindow | null;
  local: { opportunityId: string; requirement: LogOpportunityRequirement } | null;
  /** Pins that apply in the chosen hour, and how many more apply only in another. */
  pinsThisHour: ClockPinInput[];
  pinsOtherHours: number;
}

/**
 * Every slot of a version in the order the list shows them: by start (a float
 * slot by its earliest start, then its position), with local eligibility and
 * the chosen hour's pins attached.
 */
export function buildClockViewSlots(input: {
  slots: ClockSlotInput[];
  opportunities: ClockOpportunityInput[];
  pins: ClockPinInput[];
  hourIndex: number;
}): ClockViewSlot[] {
  const opportunityBySlot = new Map(input.opportunities.map((o) => [o.slot_id, o]));
  const rows = input.slots.map((slot) => {
    const float = floatWindowFromSlot(slot);
    const opportunity = opportunityBySlot.get(slot.id) ?? null;
    const pins = opportunity
      ? input.pins.filter((pin) => pin.local_opportunity_id === opportunity.id)
      : [];
    const startSeconds = float ? float.startEarliest : (slot.start_offset_seconds ?? 0);
    const row: ClockViewSlot = {
      id: slot.id,
      label: slotDisplayLabel(slot),
      kind: float ? "segment" : slotVisualKind(slot),
      startSeconds,
      durationSeconds: float ? float.lengthMax : slot.duration_seconds,
      float,
      local: opportunity
        ? { opportunityId: opportunity.id, requirement: opportunity.requirement }
        : null,
      pinsThisHour: pins.filter((pin) => pinAppliesToHour(pin, input.hourIndex)),
      pinsOtherHours: pins.filter((pin) => !pinAppliesToHour(pin, input.hourIndex)).length,
    };
    return { row, position: slot.position };
  });
  rows.sort((a, b) => a.row.startSeconds - b.row.startSeconds || a.position - b.position);
  return rows.map((entry) => entry.row);
}

/** The slot to select when the URL names none: the first locally-eligible one, else the first. */
export function defaultSelectedSlotId(slots: ClockViewSlot[]): string | null {
  return slots.find((slot) => slot.local)?.id ?? slots[0]?.id ?? null;
}

export interface ShiftInfo {
  hours: number;
  /** Station-local start of the shift, "HH:MM:SS", when a schedule entry says so. */
  startTime: string | null;
}

/**
 * How many hours a clock's shift runs and when it starts, from the schedule
 * entries that air on it: the longest live entry decides (the clock repeats
 * once per hour of the block). No entry, or a one-hour block, means one hour.
 */
export function shiftInfoFromEntries(
  entries: Array<{ air_time: string; duration_minutes: number }>,
): ShiftInfo {
  const longest = entries.reduce<{ air_time: string; duration_minutes: number } | null>(
    (best, entry) =>
      best === null || entry.duration_minutes > best.duration_minutes ? entry : best,
    null,
  );
  if (!longest) return { hours: 1, startTime: null };
  return {
    hours: Math.max(1, Math.ceil(longest.duration_minutes / 60)),
    startTime: longest.air_time,
  };
}

/** "8:12 AM" — the wall-clock time `offsetSeconds` into the given zero-based hour of a shift starting at `startTime` ("HH:MM[:SS]"). */
export function shiftTimeOfDay(
  startTime: string,
  hourIndex: number,
  offsetSeconds: number,
): string {
  const [hourText, minuteText] = startTime.split(":");
  const startMinutes = Number(hourText) * 60 + Number(minuteText);
  const total = startMinutes + hourIndex * 60 + Math.floor(offsetSeconds / 60);
  const wrapped = ((total % 1440) + 1440) % 1440;
  const hour = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  const period = hour < 12 ? "AM" : "PM";
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, "0")} ${period}`;
}

/** "Hour 2 of 2 · 8:00 – 9:00 AM" (times only when the shift's start is known). */
export function describeShiftHour(shift: ShiftInfo, hourIndex: number): string {
  const head = `Hour ${hourIndex + 1} of ${shift.hours}`;
  if (!shift.startTime) return head;
  return `${head} · ${shiftTimeOfDay(shift.startTime, hourIndex, 0)} – ${shiftTimeOfDay(shift.startTime, hourIndex + 1, 0)}`;
}

/** Clamps a requested hour into the shift; garbage becomes the first hour. */
export function clampHour(raw: unknown, hours: number): number {
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(value) || value < 0) return 0;
  return Math.min(value, Math.max(0, hours - 1));
}
