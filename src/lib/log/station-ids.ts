// Station IDs (docs/broadcast-roles.md §5): for one clock, whether the hourly
// legal ID is pinned for every hour the clock runs. The clock page warns when
// it isn't. 47 CFR §73.1201 wants an ID each hour, as close to the top as
// feasible, at a natural break; the clock says where the ID position is (an
// opportunity permitting `legal_id`), and a pin (log_opportunity_assignments)
// fills it. Pure — the clock page loads the rows.

export interface StationIdPosition {
  opportunityId: string;
  /** The network slot's label, e.g. "Music Bed". */
  label: string;
  /** Seconds into the hour the slot starts. */
  startOffsetSeconds: number;
  requirement: "optional" | "required";
}

export interface StationIdPin {
  id: string;
  opportunityId: string;
  contentTitle: string;
  /** Which hour of the shift (0 = first); null = every hour. */
  hourIndex: number | null;
  /** 0 = Sunday; empty = every day. */
  daysOfWeek: number[];
}

export type StationIdStatus = "covered" | "partial" | "not_pinned" | "no_position";

export interface StationIdHourGap {
  hourIndex: number;
  /** Days that hour has no ID; empty means none at all. */
  missingDays: number[];
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * Whether each hour of the shift has an ID pin on every day the clock airs.
 * A pin with no hour applies to every hour; a pin with no days to every day.
 */
export function stationIdCoverage(input: {
  shiftHours: number;
  airDays: number[];
  positions: StationIdPosition[];
  pins: StationIdPin[];
}): { status: StationIdStatus; gaps: StationIdHourGap[] } {
  if (input.positions.length === 0) return { status: "no_position", gaps: [] };
  const positionIds = new Set(input.positions.map((position) => position.opportunityId));
  const pins = input.pins.filter((pin) => positionIds.has(pin.opportunityId));
  const airDays = input.airDays.length > 0 ? input.airDays : ALL_DAYS;
  const hours = Math.max(1, input.shiftHours);

  const gaps: StationIdHourGap[] = [];
  for (let hourIndex = 0; hourIndex < hours; hourIndex++) {
    const covered = new Set<number>();
    for (const pin of pins) {
      if (pin.hourIndex !== null && pin.hourIndex !== hourIndex) continue;
      for (const day of pin.daysOfWeek.length > 0 ? pin.daysOfWeek : ALL_DAYS) covered.add(day);
    }
    const missingDays = airDays.filter((day) => !covered.has(day));
    if (missingDays.length > 0) {
      gaps.push({
        hourIndex,
        missingDays: missingDays.length === airDays.length ? [] : missingDays,
      });
    }
  }

  if (gaps.length === 0) return { status: "covered", gaps };
  if (pins.length === 0) return { status: "not_pinned", gaps };
  return { status: "partial", gaps };
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Hour 2", "Hour 2 (Sat, Sun)" — one gap as a short phrase. */
export function describeGap(gap: StationIdHourGap): string {
  const hour = `Hour ${gap.hourIndex + 1}`;
  return gap.missingDays.length === 0
    ? hour
    : `${hour} (${gap.missingDays.map((day) => DAY_NAMES[day]).join(", ")})`;
}
