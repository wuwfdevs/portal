// The real WUWF orders the 2026-09-24 redesign brief lists, transcribed from
// the signed originals (read from Drive on 2026-09-25 — see
// docs/underwriting-traffic-redesign.md §2) into the schedule-line model.
// Used by demand.test.ts and inventory-selection.test.ts as the acceptance
// fixtures; nothing here is invented — every stated total is the document's
// own number, and the two known inconsistencies (309 Punk's "Oct. 3" is a
// Saturday; the Symphony's revised flight lands after its end date) are kept
// as the documents print them so the review warnings can be tested.
//
// Pools are named, not resolved: a fixture line names the inventory class
// the order sells ("AM Drive", "Total Program Rotation") and leaves the
// mapping to Log opportunities to the station's own pool targets.

import type { AllocationLike, ScheduleRuleLike } from "../demand";

export interface FixtureLine extends ScheduleRuleLike {
  label: string;
  pool: string | null;
  program: string | null;
  target_time: string | null;
  window_start: string | null;
  window_end: string | null;
  flight: string | null;
  is_bonus: boolean;
  /** The order's own count for this line, when it prints one. */
  stated_total: number | null;
  allocations: AllocationLike[];
  source_text: string;
}

export interface FixtureOrder {
  name: string;
  effective_from: string;
  effective_to: string | null;
  stated_total_spots: number | null;
  affidavit_required: boolean;
  makegood_requires_agency_approval: boolean;
  separation_source_text: string | null;
  lines: FixtureLine[];
  /** Copy the order prints, by label, with the flight it belongs to when the script names a specific show. */
  copy?: { label: string; flight: string | null }[];
}

type Partial = Omit<
  FixtureLine,
  | "days_of_week"
  | "count_per_day"
  | "quantity_per_week"
  | "max_per_day"
  | "status"
  | "cancelled_from"
  | "end_date"
  | "pool"
  | "program"
  | "target_time"
  | "window_start"
  | "window_end"
  | "flight"
  | "is_bonus"
  | "allocations"
  | "stated_total"
> &
  Partial2;

interface Partial2 {
  days_of_week?: number[];
  count_per_day?: number | null;
  quantity_per_week?: number | null;
  max_per_day?: number | null;
  status?: ScheduleRuleLike["status"];
  cancelled_from?: string | null;
  end_date?: string | null;
  pool?: string | null;
  program?: string | null;
  target_time?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  flight?: string | null;
  is_bonus?: boolean;
  allocations?: AllocationLike[];
  stated_total?: number | null;
}

function line(input: Partial): FixtureLine {
  return {
    days_of_week: [],
    count_per_day: null,
    quantity_per_week: null,
    max_per_day: null,
    status: "active",
    cancelled_from: null,
    end_date: null,
    pool: null,
    program: null,
    target_time: null,
    window_start: null,
    window_end: null,
    flight: null,
    is_bonus: false,
    allocations: [],
    stated_total: null,
    ...input,
  };
}

const WEEKDAYS = [1, 2, 3, 4, 5];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** One credit on each listed date. */
function dates(...isoDates: string[]): AllocationLike[] {
  return isoDates.map((period_start) => ({
    period_kind: "day" as const,
    period_start,
    quantity: 1,
  }));
}

/** A run of dates, inclusive. */
function range(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  for (
    let d = new Date(`${startISO}T00:00:00Z`);
    d.toISOString().slice(0, 10) <= endISO;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Week-grid quantities starting the Monday given, one per column. */
function grid(firstMondayISO: string, quantities: number[]): AllocationLike[] {
  return quantities.map((quantity, index) => {
    const d = new Date(`${firstMondayISO}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + index * 7);
    return { period_kind: "week" as const, period_start: d.toISOString().slice(0, 10), quantity };
  });
}

// ----------------------------------------------------------------------------

/** Autumn Beck Blackledge — the existing reference agreement (docs/underwriting-design.md §1). */
export const AUTUMN_BECK_BLACKLEDGE: FixtureOrder = {
  name: "Autumn Beck Blackledge",
  effective_from: "2026-08-03",
  effective_to: "2027-01-31",
  stated_total_spots: 104,
  affidavit_required: false,
  makegood_requires_agency_approval: false,
  separation_source_text: null,
  copy: [
    { label: "Message A", flight: null },
    { label: "Message B", flight: null },
  ],
  lines: [
    line({
      label: "Monday AM drive",
      rule_kind: "fixed_days",
      days_of_week: [1],
      count_per_day: 1,
      program: "Morning Edition",
      target_time: "07:49",
      start_date: "2026-08-03",
      end_date: "2027-01-31",
      stated_total: 26,
      source_text: "Monday ~7:49am x 26 weeks",
    }),
    line({
      label: "Tuesday PM drive",
      rule_kind: "fixed_days",
      days_of_week: [2],
      count_per_day: 1,
      program: "All Things Considered",
      target_time: "16:48",
      start_date: "2026-08-03",
      end_date: "2027-01-31",
      stated_total: 26,
      source_text: "Tuesday ~4:48pm x 26 weeks",
    }),
    line({
      label: "Wed/Thu AM drive",
      rule_kind: "fixed_days",
      days_of_week: [3, 4],
      count_per_day: 1,
      program: "Morning Edition",
      target_time: "08:06",
      start_date: "2026-08-03",
      end_date: "2027-01-31",
      stated_total: 52,
      source_text: "Wednesday and Thursday ~8:06am x 26 weeks",
    }),
  ],
};

/** Boyles & Boyles, 9/21/26–9/19/27. */
export const BOYLES: FixtureOrder = {
  name: "Boyles & Boyles",
  effective_from: "2026-09-21",
  effective_to: "2027-09-19",
  stated_total_spots: 312,
  affidavit_required: false,
  makegood_requires_agency_approval: false,
  separation_source_text: null,
  lines: [
    line({
      label: "Drive time",
      rule_kind: "weekly_quota",
      days_of_week: WEEKDAYS,
      quantity_per_week: 2,
      max_per_day: 1,
      pool: "AM Drive",
      start_date: "2026-09-21",
      end_date: "2027-09-19",
      stated_total: 104,
      source_text: "104 Drive Time Spots: 2 Drive Time spots each week",
    }),
    line({
      label: "Total Program Rotation",
      rule_kind: "weekly_quota",
      days_of_week: ALL_DAYS,
      quantity_per_week: 3,
      max_per_day: 1,
      pool: "Total Program Rotation",
      start_date: "2026-09-21",
      end_date: "2027-09-19",
      stated_total: 156,
      source_text: "156 Total Program Rotation spots: 3 spots each week",
    }),
    line({
      label: "Weekend Edition",
      rule_kind: "weekly_quota",
      days_of_week: [0, 6],
      quantity_per_week: 1,
      max_per_day: 1,
      pool: "Weekend Edition",
      start_date: "2026-09-21",
      end_date: "2027-09-19",
      stated_total: 52,
      source_text: "52 Weekend Edition spots: 1 each week in either Sat. or Sun WE",
    }),
  ],
};

/** Natural Awakenings trade, 4/13/26–4/11/27. */
export const NATURAL_AWAKENINGS: FixtureOrder = {
  name: "Natural Awakenings",
  effective_from: "2026-04-13",
  effective_to: "2027-04-11",
  stated_total_spots: 156,
  affidavit_required: false,
  makegood_requires_agency_approval: false,
  separation_source_text: null,
  lines: [
    line({
      label: "ROS",
      rule_kind: "weekly_quota",
      days_of_week: ALL_DAYS,
      quantity_per_week: 3,
      max_per_day: 1,
      pool: "Total Program Rotation",
      start_date: "2026-04-13",
      end_date: "2027-04-11",
      stated_total: 156,
      source_text: "Total 156 ROS spots: 3 spots per week Monday- Sunday",
    }),
  ],
};

/** Move Period, 8/31–11/29/26. */
export const MOVE_PERIOD: FixtureOrder = {
  name: "Move Period",
  effective_from: "2026-08-31",
  effective_to: "2026-11-29",
  stated_total_spots: 78,
  affidavit_required: true,
  makegood_requires_agency_approval: false,
  separation_source_text: null,
  copy: [
    { label: "Message 1", flight: null },
    { label: "Message 2", flight: null },
  ],
  lines: [
    line({
      label: "AM drive",
      rule_kind: "fixed_days",
      days_of_week: [1, 3, 4],
      count_per_day: 1,
      pool: "AM Drive",
      start_date: "2026-08-31",
      end_date: "2026-11-29",
      stated_total: 39,
      source_text: "3 AM Drive: 1 each Mon, Wed, Thursday",
    }),
    line({
      label: "PM drive",
      rule_kind: "fixed_days",
      days_of_week: [2],
      count_per_day: 1,
      pool: "PM Drive",
      start_date: "2026-08-31",
      end_date: "2026-11-29",
      stated_total: 13,
      source_text: "1 PM Drive each week Tuesday",
    }),
    line({
      label: "Total Program Rotation",
      rule_kind: "fixed_days",
      days_of_week: [2, 5],
      count_per_day: 1,
      pool: "Total Program Rotation",
      start_date: "2026-08-31",
      end_date: "2026-11-29",
      stated_total: 26,
      source_text: "26 Total Program Rotation Spots: 2 spots each week: 1 each Tuesday, Friday",
    }),
  ],
};

/** Bud & Alley's, 2/16–11/29/26 — two dated drive phases and a first-week rotation exception. */
export const BUD_AND_ALLEYS: FixtureOrder = {
  name: "Bud & Alley's",
  effective_from: "2026-02-16",
  effective_to: "2026-11-29",
  stated_total_spots: 134,
  affidavit_required: false,
  makegood_requires_agency_approval: false,
  separation_source_text: null,
  lines: [
    line({
      label: "Drive, Feb 16 – Apr 26 (AM)",
      rule_kind: "weekly_quota",
      days_of_week: WEEKDAYS,
      quantity_per_week: 2,
      max_per_day: 1,
      pool: "AM Drive",
      start_date: "2026-02-16",
      end_date: "2026-04-26",
      stated_total: 20,
      source_text: "Feb. 16- April 26 3 Drive Time spots per week, 2 AM, 1 PM",
    }),
    line({
      label: "Drive, Feb 16 – Apr 26 (PM)",
      rule_kind: "weekly_quota",
      days_of_week: WEEKDAYS,
      quantity_per_week: 1,
      max_per_day: 1,
      pool: "PM Drive",
      start_date: "2026-02-16",
      end_date: "2026-04-26",
      stated_total: 10,
      source_text: "Feb. 16- April 26 3 Drive Time spots per week, 2 AM, 1 PM",
    }),
    line({
      label: "Drive, Apr 27 – Nov 29 (AM)",
      rule_kind: "weekly_quota",
      days_of_week: WEEKDAYS,
      quantity_per_week: 2,
      max_per_day: 1,
      pool: "AM Drive",
      start_date: "2026-04-27",
      end_date: "2026-11-29",
      stated_total: 62,
      source_text: "April 27-Nov 29 2 AM Drive Time spots per week",
    }),
    line({
      label: "Rotation, week of Feb 16",
      rule_kind: "weekly_quota",
      days_of_week: ALL_DAYS,
      quantity_per_week: 2,
      max_per_day: 1,
      pool: "Total Program Rotation",
      start_date: "2026-02-16",
      end_date: "2026-02-22",
      stated_total: 2,
      source_text: "2 TPR the week Feb 16",
    }),
    line({
      label: "Rotation, Feb 23 – Nov 29",
      rule_kind: "weekly_quota",
      days_of_week: ALL_DAYS,
      quantity_per_week: 1,
      max_per_day: 1,
      pool: "Total Program Rotation",
      start_date: "2026-02-23",
      end_date: "2026-11-29",
      stated_total: 40,
      source_text: "1 TPR each week Feb 23- Nov 29",
    }),
  ],
};

/** Lynn Keefe Pediatrics, 6/9/26–6/6/27: 52 spots, Carpool, Tuesday 8:19 AM. */
export const LYNN_KEEFE: FixtureOrder = {
  name: "Lynn Keefe Pediatrics",
  effective_from: "2026-06-09",
  effective_to: "2027-06-06",
  stated_total_spots: 52,
  affidavit_required: false,
  makegood_requires_agency_approval: false,
  separation_source_text: null,
  lines: [
    line({
      label: "Carpool Tuesday",
      rule_kind: "fixed_days",
      days_of_week: [2],
      count_per_day: 1,
      pool: "Carpool",
      target_time: "08:19",
      start_date: "2026-06-09",
      end_date: "2027-06-06",
      stated_total: 52,
      source_text: "52 Spots in Carpool Tuesday @ 8:19 AM",
    }),
  ],
};

/** Open Books, 9/7/26–9/6/27: 52 spots, Carpool, Thursday 8:44 AM. */
export const OPEN_BOOKS: FixtureOrder = {
  name: "Open Books",
  effective_from: "2026-09-07",
  effective_to: "2027-09-06",
  stated_total_spots: 52,
  affidavit_required: true,
  makegood_requires_agency_approval: false,
  separation_source_text: null,
  lines: [
    line({
      label: "Carpool Thursday",
      rule_kind: "fixed_days",
      days_of_week: [4],
      count_per_day: 1,
      pool: "Carpool",
      target_time: "08:44",
      start_date: "2026-09-07",
      end_date: "2027-09-06",
      stated_total: 52,
      source_text: "52 total spots: 1 each Thursday@ 8:44 in Carpool",
    }),
  ],
};

/** 309 Punk Project, 10/1/26–1/28/27, "17 weeks": Friday 7:49 then Thursday 8:19. Oct 3 is a Saturday, as printed. */
export const PUNK_309: FixtureOrder = {
  name: "309 Punk Project",
  effective_from: "2026-10-01",
  effective_to: "2027-01-28",
  stated_total_spots: 17,
  affidavit_required: true,
  makegood_requires_agency_approval: false,
  separation_source_text: null,
  lines: [
    line({
      label: "Carpool, Friday phase",
      rule_kind: "fixed_days",
      days_of_week: [5],
      count_per_day: 1,
      pool: "Carpool",
      target_time: "07:49",
      start_date: "2026-10-03",
      end_date: "2026-10-23",
      stated_total: null,
      source_text: "Oct. 3- Oct 23 Friday @ 7:49 AM",
    }),
    line({
      label: "Carpool, Thursday phase",
      rule_kind: "fixed_days",
      days_of_week: [4],
      count_per_day: 1,
      pool: "Carpool",
      target_time: "08:19",
      start_date: "2026-10-29",
      end_date: "2027-01-28",
      stated_total: null,
      source_text: "Oct 29-Jan 28 Thursday @ 8:19 AM",
    }),
  ],
};

/** Choral Society, 10/5/26–5/15/27: four concert flights, each 1 AM/weekday then 2 AM/weekday. */
export const CHORAL_SOCIETY: FixtureOrder = {
  name: "Choral Society of Pensacola",
  effective_from: "2026-10-05",
  effective_to: "2027-05-15",
  stated_total_spots: 60,
  affidavit_required: true,
  makegood_requires_agency_approval: false,
  separation_source_text: null,
  copy: [
    { label: "Voices of Sea & Sky", flight: "Voices of Sea & Sky" },
    { label: "El Mesias", flight: "El Mesias" },
    { label: "Alzheimer's Stories", flight: "Alzheimer's Stories" },
    { label: "Mass in Blue", flight: "Mass in Blue" },
  ],
  lines: [
    line({
      label: "Voices of Sea & Sky, week 1",
      rule_kind: "fixed_days",
      days_of_week: WEEKDAYS,
      count_per_day: 1,
      pool: "AM Drive",
      flight: "Voices of Sea & Sky",
      start_date: "2026-10-05",
      end_date: "2026-10-09",
      stated_total: 5,
      source_text: "1 AM Drive: Oct 5-9",
    }),
    line({
      label: "Voices of Sea & Sky, week 2",
      rule_kind: "fixed_days",
      days_of_week: WEEKDAYS,
      count_per_day: 2,
      pool: "AM Drive",
      flight: "Voices of Sea & Sky",
      start_date: "2026-10-12",
      end_date: "2026-10-16",
      stated_total: 10,
      source_text: "2 AM Drive: Ot 12-16",
    }),
    line({
      label: "El Mesias, week 1",
      rule_kind: "fixed_days",
      days_of_week: WEEKDAYS,
      count_per_day: 1,
      pool: "AM Drive",
      flight: "El Mesias",
      start_date: "2026-11-23",
      end_date: "2026-11-27",
      stated_total: 5,
      source_text: "1 AM Drive Each: Nov 23-27",
    }),
    line({
      label: "El Mesias, week 2",
      rule_kind: "fixed_days",
      days_of_week: WEEKDAYS,
      count_per_day: 2,
      pool: "AM Drive",
      flight: "El Mesias",
      start_date: "2026-11-30",
      end_date: "2026-12-04",
      stated_total: 10,
      source_text: "2 AM Drive each: Nov 30, Dec 1-4",
    }),
    line({
      label: "Alzheimer's Stories, week 1",
      rule_kind: "fixed_days",
      days_of_week: WEEKDAYS,
      count_per_day: 1,
      pool: "AM Drive",
      flight: "Alzheimer's Stories",
      start_date: "2027-03-08",
      end_date: "2027-03-12",
      stated_total: 5,
      source_text: "1 AM Drive each: March 8-12",
    }),
    line({
      label: "Alzheimer's Stories, week 2",
      rule_kind: "fixed_days",
      days_of_week: WEEKDAYS,
      count_per_day: 2,
      pool: "AM Drive",
      flight: "Alzheimer's Stories",
      start_date: "2027-03-15",
      end_date: "2027-03-19",
      stated_total: 10,
      source_text: "2 AM Drive each: March 15-19",
    }),
    line({
      label: "Mass in Blue, week 1",
      rule_kind: "fixed_days",
      days_of_week: WEEKDAYS,
      count_per_day: 1,
      pool: "AM Drive",
      flight: "Mass in Blue",
      start_date: "2027-05-03",
      end_date: "2027-05-07",
      stated_total: 5,
      source_text: "1 AM Drive each: May 3-7",
    }),
    line({
      label: "Mass in Blue, week 2",
      rule_kind: "fixed_days",
      days_of_week: WEEKDAYS,
      count_per_day: 2,
      pool: "AM Drive",
      flight: "Mass in Blue",
      start_date: "2027-05-10",
      end_date: "2027-05-14",
      stated_total: 10,
      source_text: "2 AM Drive each May 10-14",
    }),
  ],
};

/** Emerald Coast Theatre Company, 9/8/26–5/23/27: six productions with explicit dates. */
export const EMERALD_COAST_THEATRE: FixtureOrder = {
  name: "Emerald Coast Theatre Company",
  effective_from: "2026-09-08",
  effective_to: "2027-05-23",
  stated_total_spots: 64,
  affidavit_required: true,
  makegood_requires_agency_approval: false,
  separation_source_text: null,
  lines: [
    line({
      label: "#1 Come From Away — AM drive",
      rule_kind: "explicit_dates",
      pool: "AM Drive",
      flight: "Come From Away",
      start_date: "2026-09-08",
      end_date: "2026-09-27",
      stated_total: 2,
      allocations: dates("2026-09-11", "2026-09-24"),
      source_text: "2 AM Drive Time Spots: 1 each day Sept 11, 24",
    }),
    line({
      label: "#1 Come From Away — ROS",
      rule_kind: "explicit_dates",
      pool: "Total Program Rotation",
      flight: "Come From Away",
      start_date: "2026-09-08",
      end_date: "2026-09-27",
      stated_total: 8,
      allocations: dates(
        "2026-09-09",
        "2026-09-10",
        "2026-09-11",
        "2026-09-15",
        "2026-09-17",
        "2026-09-18",
        "2026-09-24",
        "2026-09-25",
      ),
      source_text: "8 ROS spots: 1 each Sept. 9, 10, 11, 15, 17, 18, 24, 25",
    }),
    line({
      label: "#2 39 Steps — AM drive",
      rule_kind: "explicit_dates",
      pool: "AM Drive",
      flight: "39 Steps",
      start_date: "2026-10-14",
      end_date: "2026-10-25",
      stated_total: 2,
      allocations: dates("2026-10-16", "2026-10-22"),
      source_text: "2 AM Drive Time Spots: 1 each day: Oct 16, 22",
    }),
    line({
      label: "#2 39 Steps — ROS",
      rule_kind: "explicit_dates",
      pool: "Total Program Rotation",
      flight: "39 Steps",
      start_date: "2026-10-14",
      end_date: "2026-10-25",
      stated_total: 7,
      allocations: dates(
        "2026-10-14",
        "2026-10-15",
        "2026-10-16",
        "2026-10-20",
        "2026-10-21",
        "2026-10-22",
        "2026-10-23",
      ),
      source_text: "7 ROS spots: 1 each: Oct 14, 15, 16, 20, 21,22, 23",
    }),
    line({
      label: "#3 Million Dollar Quartet Christmas — AM drive",
      rule_kind: "explicit_dates",
      pool: "AM Drive",
      flight: "Million Dollar Quartet Christmas",
      start_date: "2026-12-02",
      end_date: "2026-12-20",
      stated_total: 10,
      allocations: dates(
        "2026-12-02",
        "2026-12-03",
        "2026-12-04",
        "2026-12-10",
        "2026-12-11",
        ...range("2026-12-14", "2026-12-18"),
      ),
      source_text: "10 AM Drive: 1 each Dec 2,3,4, 10,11, 14-18",
    }),
    line({
      label: "#3 Million Dollar Quartet Christmas — ROS",
      rule_kind: "explicit_dates",
      pool: "Total Program Rotation",
      flight: "Million Dollar Quartet Christmas",
      start_date: "2026-12-02",
      end_date: "2026-12-20",
      stated_total: 3,
      allocations: dates("2026-12-03", "2026-12-10", "2026-12-17"),
      source_text: "3 ROS spots: 1 each Dec. 3, 10 17",
    }),
    line({
      label: "#4 9 to 5 — AM drive",
      rule_kind: "explicit_dates",
      pool: "AM Drive",
      flight: "9 to 5 The Musical",
      start_date: "2027-01-21",
      end_date: "2027-02-07",
      stated_total: 2,
      allocations: dates("2027-01-22", "2027-01-28"),
      source_text: "2 AM Drive: 1 each: Jan 22, 28",
    }),
    line({
      label: "#4 9 to 5 — ROS",
      rule_kind: "explicit_dates",
      pool: "Total Program Rotation",
      flight: "9 to 5 The Musical",
      start_date: "2027-01-21",
      end_date: "2027-02-07",
      stated_total: 7,
      allocations: dates("2027-01-27", "2027-01-28", ...range("2027-02-01", "2027-02-05")),
      source_text: "7 ROS: 1 each: Jan 27,28 Feb 1-5",
    }),
    line({
      label: "#5 Dear Jack, Dear Louise — AM drive",
      rule_kind: "explicit_dates",
      pool: "AM Drive",
      flight: "Dear Jack, Dear Louise",
      start_date: "2027-02-17",
      end_date: "2027-02-28",
      stated_total: 2,
      allocations: dates("2027-02-18", "2027-02-25"),
      source_text: "2 AM Drive: 1 each Feb 18, 25",
    }),
    line({
      label: "#5 Dear Jack, Dear Louise — ROS",
      rule_kind: "explicit_dates",
      pool: "Total Program Rotation",
      flight: "Dear Jack, Dear Louise",
      start_date: "2027-02-17",
      end_date: "2027-02-28",
      stated_total: 8,
      allocations: dates(
        ...range("2027-02-17", "2027-02-19"),
        ...range("2027-02-22", "2027-02-26"),
      ),
      source_text: "8 ROS: Feb 17-19, 22-26",
    }),
    line({
      label: "#6 Frozen — AM drive",
      rule_kind: "explicit_dates",
      pool: "AM Drive",
      flight: "Frozen: The Musical",
      start_date: "2027-05-06",
      end_date: "2027-05-23",
      stated_total: 10,
      allocations: dates(
        "2027-05-06",
        "2027-05-07",
        ...range("2027-05-12", "2027-05-14"),
        ...range("2027-05-17", "2027-05-21"),
      ),
      source_text: "10 AM Drive: 1 cach May 6,7, 12-14, 17-21",
    }),
    line({
      label: "#6 Frozen — ROS",
      rule_kind: "explicit_dates",
      pool: "Total Program Rotation",
      flight: "Frozen: The Musical",
      start_date: "2027-05-06",
      end_date: "2027-05-23",
      stated_total: 3,
      allocations: dates("2027-05-07", "2027-05-14", "2027-05-21"),
      source_text: "3 ROS spots: 1 each; May 7, 14, 21",
    }),
  ],
};

/** Live Nation, 5/18–5/22/26: nine dated window spots, an agency grid by date. */
export const LIVE_NATION: FixtureOrder = {
  name: "Live Nation — Dave Matthews Band",
  effective_from: "2026-05-18",
  effective_to: "2026-05-22",
  stated_total_spots: 9,
  affidavit_required: false,
  makegood_requires_agency_approval: false,
  separation_source_text: null,
  lines: [
    line({
      label: "6:00–10:00 AM",
      rule_kind: "explicit_dates",
      pool: "AM Drive",
      window_start: "06:00",
      window_end: "10:00",
      start_date: "2026-05-18",
      end_date: "2026-05-22",
      stated_total: 3,
      allocations: dates("2026-05-18", "2026-05-20", "2026-05-22"),
      source_text: "Mon/Wed/Fri 6:00 AM – 10:00 AM, 30 secs, 1 each",
    }),
    line({
      label: "10:00 AM–3:00 PM",
      rule_kind: "explicit_dates",
      pool: "Mid-day",
      window_start: "10:00",
      window_end: "15:00",
      start_date: "2026-05-18",
      end_date: "2026-05-22",
      stated_total: 3,
      allocations: dates("2026-05-18", "2026-05-20", "2026-05-22"),
      source_text: "Mon/Wed/Fri 10:00 AM – 3:00 PM, 30 secs, 1 each",
    }),
    line({
      label: "3:00–7:00 PM",
      rule_kind: "explicit_dates",
      pool: "PM Drive",
      window_start: "15:00",
      window_end: "19:00",
      start_date: "2026-05-18",
      end_date: "2026-05-22",
      stated_total: 3,
      allocations: dates("2026-05-18", "2026-05-20", "2026-05-22"),
      source_text: "Mon/Wed/Fri 3:00 PM – 7:00 PM, 30 secs, 1 each",
    }),
  ],
};

/** FPM / University of South Florida, 4/6–6/21/26: 2 × Friday 7–8 PM in Putumayo World Music, 11 weeks. */
export const FPM_USF: FixtureOrder = {
  name: "FPM — University of South Florida (Covering Florida)",
  effective_from: "2026-04-06",
  effective_to: "2026-06-21",
  stated_total_spots: 22,
  affidavit_required: true,
  makegood_requires_agency_approval: false,
  separation_source_text: "3",
  lines: [
    line({
      label: "Putumayo, Fridays 7–8 PM",
      rule_kind: "fixed_days",
      days_of_week: [5],
      count_per_day: 2,
      program: "Putumayo World Music Hour",
      window_start: "19:00",
      window_end: "20:00",
      start_date: "2026-04-06",
      end_date: "2026-06-21",
      stated_total: 22,
      source_text: "F 7:00p- 8:00p, 15s, 2 per week x 11 weeks — PUTUMAYO WORLD MUSIC",
    }),
  ],
};

/** FPM / Florida Power & Light, 1/26–12/27/26: a 48-column week grid, five lines, zero weeks, a bonus line. */
const FPL_AM = [
  6, 4, 4, 4, 3, 2, 2, 2, 0, 3, 2, 2, 2, 3, 2, 2, 2, 0, 3, 2, 2, 2, 3, 2, 2, 2, 3, 2, 2, 2, 0, 3, 2,
  2, 2, 3, 2, 2, 2, 3, 2, 2, 2, 0, 3, 2, 2, 2,
];
const FPL_PM = [
  4, 4, 4, 4, 2, 2, 2, 2, 0, 2, 2, 2, 2, 2, 2, 2, 2, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 2, 2,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 2, 2, 2, 2,
];
const FPL_RT = [
  4, 4, 4, 2, 2, 2, 2, 1, 0, 2, 2, 2, 1, 2, 2, 2, 1, 0, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 1, 0, 2, 2,
  2, 1, 2, 2, 2, 1, 2, 2, 2, 1, 0, 2, 2, 2, 1,
];
const FPL_WK = [
  4, 2, 4, 2, 2, 1, 2, 1, 0, 2, 1, 2, 1, 2, 1, 2, 1, 0, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 0, 2, 1,
  2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 0, 2, 1, 2, 1,
];
const FPL_BN = [
  6, 12, 6, 6, 3, 6, 3, 3, 0, 3, 6, 3, 3, 3, 6, 3, 3, 0, 3, 6, 3, 3, 3, 6, 3, 3, 3, 6, 3, 3, 0, 3,
  6, 3, 3, 3, 6, 3, 3, 3, 6, 3, 3, 0, 3, 6, 3, 3,
];

export const FPM_FPL: FixtureOrder = {
  name: "FPM — Florida Power & Light",
  effective_from: "2026-01-26",
  effective_to: "2026-12-27",
  stated_total_spots: 540,
  affidavit_required: true,
  makegood_requires_agency_approval: true,
  separation_source_text: "3",
  lines: [
    line({
      label: "AM 5:00a–9:00a M–F",
      rule_kind: "week_grid",
      days_of_week: WEEKDAYS,
      max_per_day: 2,
      pool: "AM Drive",
      window_start: "05:00",
      window_end: "09:00",
      start_date: "2026-01-26",
      end_date: "2026-12-27",
      stated_total: 108,
      allocations: grid("2026-01-26", FPL_AM),
      source_text: "38 MTuWThF 5:00a- 9:00a AM … 108",
    }),
    line({
      label: "PM 3:00p–6:00p M–F",
      rule_kind: "week_grid",
      days_of_week: WEEKDAYS,
      max_per_day: 2,
      pool: "PM Drive",
      window_start: "15:00",
      window_end: "18:00",
      start_date: "2026-01-26",
      end_date: "2026-12-27",
      stated_total: 96,
      allocations: grid("2026-01-26", FPL_PM),
      source_text: "39 MTuWThF 3:00p- 6:00p PM … 96",
    }),
    line({
      label: "RT 9:00a–3:00p M–F",
      rule_kind: "week_grid",
      days_of_week: WEEKDAYS,
      max_per_day: 2,
      pool: "Mid-day",
      window_start: "09:00",
      window_end: "15:00",
      start_date: "2026-01-26",
      end_date: "2026-12-27",
      stated_total: 84,
      allocations: grid("2026-01-26", FPL_RT),
      source_text: "40 MTuWThF 9:00a- 3:00p RT … 84",
    }),
    line({
      label: "WK Sa 8:00a–12:00p",
      rule_kind: "week_grid",
      days_of_week: [6],
      max_per_day: 4,
      pool: "Weekend Edition",
      window_start: "08:00",
      window_end: "12:00",
      start_date: "2026-01-26",
      end_date: "2026-12-27",
      stated_total: 72,
      allocations: grid("2026-01-26", FPL_WK),
      source_text: "41 Sa 8:00a-12:00p WK … 72",
    }),
    line({
      label: "BN bonus 5:00a–12:00a",
      rule_kind: "week_grid",
      days_of_week: ALL_DAYS,
      max_per_day: 3,
      pool: "Total Program Rotation",
      window_start: "05:00",
      window_end: "23:59",
      is_bonus: true,
      start_date: "2026-01-26",
      end_date: "2026-12-27",
      stated_total: 180,
      allocations: grid("2026-01-26", FPL_BN),
      source_text: "42 MTuWThFSaSu 5:00a-12:00a BN $0.00 … 180",
    }),
  ],
};

/** Pensacola Symphony, updated IO: five flights; #5 cancelled, replaced by May 11–15 (after the order's April 25 end date). */
export const SYMPHONY: FixtureOrder = {
  name: "Pensacola Symphony Orchestra",
  effective_from: "2025-09-29",
  effective_to: "2026-04-25",
  stated_total_spots: 28,
  affidavit_required: true,
  makegood_requires_agency_approval: false,
  separation_source_text: null,
  lines: [
    line({
      label: "#1 Opening Night — AM",
      rule_kind: "fixed_days",
      days_of_week: WEEKDAYS,
      count_per_day: 1,
      pool: "AM Drive",
      flight: "Opening Night",
      start_date: "2025-09-29",
      end_date: "2025-10-03",
      stated_total: 5,
      source_text: "5 AM Drive Total: 1 AM Drive each day: Sept 29-Oct 3",
    }),
    line({
      label: "#2 Classically Connected — AM",
      rule_kind: "fixed_days",
      days_of_week: WEEKDAYS,
      count_per_day: 1,
      pool: "AM Drive",
      flight: "Classically Connected",
      start_date: "2025-11-03",
      end_date: "2025-11-07",
      stated_total: 5,
      source_text: "1 AM Drive each: Nov 3-7",
    }),
    line({
      label: "#2 Classically Connected — PM",
      rule_kind: "explicit_dates",
      pool: "PM Drive",
      flight: "Classically Connected",
      start_date: "2025-11-03",
      end_date: "2025-11-07",
      stated_total: 1,
      allocations: dates("2025-11-06"),
      source_text: "1 PM Drive spot Nov 6",
    }),
    line({
      label: "#3 Mahler — AM",
      rule_kind: "fixed_days",
      days_of_week: WEEKDAYS,
      count_per_day: 1,
      pool: "AM Drive",
      flight: "Mahler",
      start_date: "2026-03-02",
      end_date: "2026-03-06",
      stated_total: 5,
      source_text: "1 each March 2-6",
    }),
    line({
      label: "#3 Mahler — PM",
      rule_kind: "explicit_dates",
      pool: "PM Drive",
      flight: "Mahler",
      start_date: "2026-03-02",
      end_date: "2026-03-06",
      stated_total: 1,
      allocations: dates("2026-03-06"),
      source_text: "1 PM Drive spot March 6",
    }),
    line({
      label: "#4 Symphonic Spectacular — AM",
      rule_kind: "fixed_days",
      days_of_week: WEEKDAYS,
      count_per_day: 1,
      pool: "AM Drive",
      flight: "Symphonic Spectacular",
      start_date: "2026-03-23",
      end_date: "2026-03-27",
      stated_total: 5,
      source_text: "1 each March 23-27",
    }),
    line({
      label: "#4 Symphonic Spectacular — PM",
      rule_kind: "explicit_dates",
      pool: "PM Drive",
      flight: "Symphonic Spectacular",
      start_date: "2026-03-23",
      end_date: "2026-03-27",
      stated_total: 1,
      allocations: dates("2026-03-27"),
      source_text: "1 PM Drive spot March 27",
    }),
    line({
      label: "#5 100th Anniversary Gala — AM (cancelled)",
      rule_kind: "fixed_days",
      days_of_week: WEEKDAYS,
      count_per_day: 1,
      pool: "AM Drive",
      flight: "100th Anniversary Gala",
      start_date: "2026-04-20",
      end_date: "2026-04-24",
      stated_total: 5,
      status: "cancelled",
      cancelled_from: "2026-04-20",
      source_text:
        "#5 April 25 100th Anniversary Gala cancelled spots 5 AM Drive Total: 1 each April 20-24",
    }),
    line({
      label: "#5 Jazz Brunch — AM (revised)",
      rule_kind: "fixed_days",
      days_of_week: WEEKDAYS,
      count_per_day: 1,
      pool: "AM Drive",
      flight: "Jazz Brunch",
      start_date: "2026-05-11",
      end_date: "2026-05-15",
      stated_total: 5,
      source_text: "#5 Revised spots for May 17th Jazz Brunch 5 AM Drive Total: 1 each May 11-15",
    }),
  ],
};

/** Armstrong International Cultural Foundation, 5/4–7/5/26 (the IO prints "July 5, 2027"): cancelled before airing. */
export const ARMSTRONG: FixtureOrder = {
  name: "Armstrong International Cultural Foundation",
  effective_from: "2026-05-04",
  effective_to: "2026-07-05",
  stated_total_spots: 56,
  affidavit_required: true,
  makegood_requires_agency_approval: false,
  separation_source_text: null,
  lines: [
    line({
      label: "May 4 – Jun 21 — AM",
      rule_kind: "fixed_days",
      days_of_week: WEEKDAYS,
      count_per_day: 1,
      pool: "AM Drive",
      start_date: "2026-05-04",
      end_date: "2026-06-21",
      stated_total: 35,
      source_text: "May 4-June 21 5 AM Drive : 1 each Mon-Friday",
    }),
    line({
      label: "May 4 – Jun 21 — PM (Wed or Thu)",
      rule_kind: "weekly_quota",
      days_of_week: [3, 4],
      quantity_per_week: 1,
      max_per_day: 1,
      pool: "PM Drive",
      start_date: "2026-05-04",
      end_date: "2026-06-21",
      stated_total: 7,
      source_text: "1 PM Drive: Wed or Thursday",
    }),
    line({
      label: "Jun 22 – Jul 5 — AM",
      rule_kind: "fixed_days",
      days_of_week: WEEKDAYS,
      count_per_day: 1,
      pool: "AM Drive",
      start_date: "2026-06-22",
      end_date: "2026-07-05",
      stated_total: 10,
      source_text: "June 22 - July 5 5 AM Drive: 1 each Mon-Friday",
    }),
    line({
      label: "Jun 22 – Jul 5 — PM",
      rule_kind: "explicit_dates",
      pool: "PM Drive",
      start_date: "2026-06-22",
      end_date: "2026-07-05",
      stated_total: 4,
      allocations: dates("2026-06-24", "2026-06-25", "2026-07-01", "2026-07-02"),
      source_text: "4 PM Drive: 1 each June 24,25 July 1,2",
    }),
  ],
};

export const ALL_ORDERS: FixtureOrder[] = [
  AUTUMN_BECK_BLACKLEDGE,
  BOYLES,
  NATURAL_AWAKENINGS,
  MOVE_PERIOD,
  BUD_AND_ALLEYS,
  LYNN_KEEFE,
  OPEN_BOOKS,
  PUNK_309,
  CHORAL_SOCIETY,
  EMERALD_COAST_THEATRE,
  LIVE_NATION,
  FPM_USF,
  FPM_FPL,
  SYMPHONY,
  ARMSTRONG,
];
