// The real WUWF orders the redesign briefs list (docs/underwriting-traffic-
// redesign.md §2 and §9's acceptance corpus), transcribed from the signed
// originals (read from Drive on 2026-09-25) into the eligibility-line +
// demand-bucket model. Used by demand-compiler.test.ts, demand.test.ts and
// inventory-selection.test.ts as the acceptance fixtures; nothing here is
// invented — every stated total is the document's own number, and the known
// inconsistencies (309 Punk's "Oct. 3" is a Saturday; Phil Hall 2022's
// Weekend Edition line prints 27 for a year of Saturdays; the Symphony's
// 2021-22 "6 AM Drive spots: 1 each day Oct 11-15" names five days; its
// 2025-26 revised flight lands after the order's end date) are kept as the
// documents print them so the review warnings can be tested.
//
// Pools are named, not resolved: a fixture line names the inventory class
// the order sells ("AM Drive", "Total Program Rotation") and leaves the
// mapping to Log opportunities to the station's own pool targets. A traffic
// key names a sponsorship position ("marketplace.opening") the way Log's
// clock screen would.

import type { UwServiceLevel, UwTimeMode } from "@/lib/database.types";
import { compileDemandBuckets, type CompiledBucket, type EntrySpec } from "../demand-compiler";
import type { ScheduleLineLike } from "../demand";

export interface FixtureLine {
  label: string;
  spec: EntrySpec;
  /** Eligible weekdays; empty means any. */
  days_of_week: number[];
  pool: string | null;
  program: string | null;
  time_mode: UwTimeMode;
  preferred_time: string | null;
  window_start: string | null;
  window_end: string | null;
  required_opportunity_key: string | null;
  max_per_day: number | null;
  service_level: UwServiceLevel;
  flight: string | null;
  start_date: string;
  end_date: string | null;
  status: "active" | "cancelled";
  cancelled_from: string | null;
  /** The order's own count for this line, when it prints one. */
  stated_total: number | null;
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

type LineInput = Pick<FixtureLine, "label" | "spec" | "start_date" | "source_text"> &
  Partial<Omit<FixtureLine, "label" | "spec" | "start_date" | "source_text">>;

function line(input: LineInput): FixtureLine {
  return {
    days_of_week: [],
    pool: null,
    program: null,
    time_mode: "any",
    preferred_time: null,
    window_start: null,
    window_end: null,
    required_opportunity_key: null,
    max_per_day: null,
    service_level: "guaranteed",
    flight: null,
    end_date: null,
    status: "active",
    cancelled_from: null,
    stated_total: null,
    ...input,
  };
}

/** A fixture line as the pure modules see a stored schedule line. */
export function toScheduleLine(fixtureLine: FixtureLine): ScheduleLineLike {
  return {
    entry_kind: fixtureLine.spec.kind,
    entry_spec: fixtureLine.spec,
    days_of_week: fixtureLine.days_of_week,
    start_date: fixtureLine.start_date,
    end_date: fixtureLine.end_date,
    status: fixtureLine.status,
    cancelled_from: fixtureLine.cancelled_from,
    time_mode: fixtureLine.time_mode,
    preferred_time: fixtureLine.preferred_time,
    window_start: fixtureLine.window_start,
    window_end: fixtureLine.window_end,
    required_opportunity_key: fixtureLine.required_opportunity_key,
    max_per_day: fixtureLine.max_per_day,
    service_level: fixtureLine.service_level,
    stated_total: fixtureLine.stated_total,
  };
}

/** The demand buckets a fixture line compiles to. */
export function compile(fixtureLine: FixtureLine): CompiledBucket[] {
  return compileDemandBuckets(fixtureLine.spec, fixtureLine);
}

const WEEKDAYS = [1, 2, 3, 4, 5];

/** One credit on each listed date. */
function dates(...isoDates: string[]): { date: string; quantity: number }[] {
  return isoDates.map((date) => ({ date, quantity: 1 }));
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
function grid(
  firstMondayISO: string,
  quantities: number[],
): { week_start: string; quantity: number }[] {
  return quantities.map((quantity, index) => {
    const d = new Date(`${firstMondayISO}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + index * 7);
    return { week_start: d.toISOString().slice(0, 10), quantity };
  });
}

// ----------------------------------------------------------------------------

/** Autumn Beck Blackledge — the existing reference agreement (docs/underwriting-design.md §1): "Monday ~7:49am x 26 weeks" is a preferred time, not an exact one. */
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
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: [1],
      program: "Morning Edition",
      time_mode: "preferred",
      preferred_time: "07:49",
      start_date: "2026-08-03",
      end_date: "2027-01-31",
      stated_total: 26,
      source_text: "Monday ~7:49am x 26 weeks",
    }),
    line({
      label: "Tuesday PM drive",
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: [2],
      program: "All Things Considered",
      time_mode: "preferred",
      preferred_time: "16:48",
      start_date: "2026-08-03",
      end_date: "2027-01-31",
      stated_total: 26,
      source_text: "Tuesday ~4:48pm x 26 weeks",
    }),
    line({
      label: "Wed/Thu AM drive",
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: [3, 4],
      program: "Morning Edition",
      time_mode: "preferred",
      preferred_time: "08:06",
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
      spec: { kind: "weekly_quota", quantity: 2 },
      days_of_week: WEEKDAYS,
      max_per_day: 1,
      pool: "AM Drive",
      start_date: "2026-09-21",
      end_date: "2027-09-19",
      stated_total: 104,
      source_text: "104 Drive Time Spots: 2 Drive Time spots each week",
    }),
    line({
      label: "Total Program Rotation",
      spec: { kind: "weekly_quota", quantity: 3 },
      max_per_day: 1,
      pool: "Total Program Rotation",
      start_date: "2026-09-21",
      end_date: "2027-09-19",
      stated_total: 156,
      source_text: "156 Total Program Rotation spots: 3 spots each week",
    }),
    line({
      label: "Weekend Edition",
      spec: { kind: "weekly_quota", quantity: 1 },
      days_of_week: [0, 6],
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
      spec: { kind: "weekly_quota", quantity: 3 },
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
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: [1, 3, 4],
      pool: "AM Drive",
      start_date: "2026-08-31",
      end_date: "2026-11-29",
      stated_total: 39,
      source_text: "3 AM Drive: 1 each Mon, Wed, Thursday",
    }),
    line({
      label: "PM drive",
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: [2],
      pool: "PM Drive",
      start_date: "2026-08-31",
      end_date: "2026-11-29",
      stated_total: 13,
      source_text: "1 PM Drive each week Tuesday",
    }),
    line({
      label: "Total Program Rotation",
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: [2, 5],
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
      spec: { kind: "weekly_quota", quantity: 2 },
      days_of_week: WEEKDAYS,
      max_per_day: 1,
      pool: "AM Drive",
      start_date: "2026-02-16",
      end_date: "2026-04-26",
      stated_total: 20,
      source_text: "Feb. 16- April 26 3 Drive Time spots per week, 2 AM, 1 PM",
    }),
    line({
      label: "Drive, Feb 16 – Apr 26 (PM)",
      spec: { kind: "weekly_quota", quantity: 1 },
      days_of_week: WEEKDAYS,
      max_per_day: 1,
      pool: "PM Drive",
      start_date: "2026-02-16",
      end_date: "2026-04-26",
      stated_total: 10,
      source_text: "Feb. 16- April 26 3 Drive Time spots per week, 2 AM, 1 PM",
    }),
    line({
      label: "Drive, Apr 27 – Nov 29 (AM)",
      spec: { kind: "weekly_quota", quantity: 2 },
      days_of_week: WEEKDAYS,
      max_per_day: 1,
      pool: "AM Drive",
      start_date: "2026-04-27",
      end_date: "2026-11-29",
      stated_total: 62,
      source_text: "April 27-Nov 29 2 AM Drive Time spots per week",
    }),
    line({
      label: "Rotation, week of Feb 16",
      spec: { kind: "weekly_quota", quantity: 2 },
      max_per_day: 1,
      pool: "Total Program Rotation",
      start_date: "2026-02-16",
      end_date: "2026-02-22",
      stated_total: 2,
      source_text: "2 TPR the week Feb 16",
    }),
    line({
      label: "Rotation, Feb 23 – Nov 29",
      spec: { kind: "weekly_quota", quantity: 1 },
      max_per_day: 1,
      pool: "Total Program Rotation",
      start_date: "2026-02-23",
      end_date: "2026-11-29",
      stated_total: 40,
      source_text: "1 TPR each week Feb 23- Nov 29",
    }),
  ],
};

/** Lynn Keefe Pediatrics, 6/9/26–6/6/27: 52 spots, Carpool, Tuesday 8:19 AM — an exact slot. */
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
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: [2],
      pool: "Carpool",
      time_mode: "exact",
      preferred_time: "08:19",
      start_date: "2026-06-09",
      end_date: "2027-06-06",
      stated_total: 52,
      source_text: "52 Spots in Carpool Tuesday @ 8:19 AM",
    }),
  ],
};

/** Open Books, 9/7/26–9/6/27: 52 spots, Carpool, Thursday 8:44 AM (corpus #1). */
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
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: [4],
      pool: "Carpool",
      time_mode: "exact",
      preferred_time: "08:44",
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
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: [5],
      pool: "Carpool",
      time_mode: "exact",
      preferred_time: "07:49",
      start_date: "2026-10-03",
      end_date: "2026-10-23",
      source_text: "Oct. 3- Oct 23 Friday @ 7:49 AM",
    }),
    line({
      label: "Carpool, Thursday phase",
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: [4],
      pool: "Carpool",
      time_mode: "exact",
      preferred_time: "08:19",
      start_date: "2026-10-29",
      end_date: "2027-01-28",
      source_text: "Oct 29-Jan 28 Thursday @ 8:19 AM",
    }),
  ],
};

function choralFlight(name: string, week1: string, week2: string): FixtureLine[] {
  const end = (monday: string) => {
    const d = new Date(`${monday}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 4);
    return d.toISOString().slice(0, 10);
  };
  return [
    line({
      label: `${name}, week 1`,
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: WEEKDAYS,
      pool: "AM Drive",
      flight: name,
      start_date: week1,
      end_date: end(week1),
      stated_total: 5,
      source_text: `1 AM Drive each weekday, week of ${week1}`,
    }),
    line({
      label: `${name}, week 2`,
      spec: { kind: "fixed_days", count_per_day: 2 },
      days_of_week: WEEKDAYS,
      pool: "AM Drive",
      flight: name,
      start_date: week2,
      end_date: end(week2),
      stated_total: 10,
      source_text: `2 AM Drive each weekday, week of ${week2}`,
    }),
  ];
}

/** Choral Society, 10/5/26–5/15/27: four concert flights, each 1 AM/weekday then 2 AM/weekday — no per-day cap. */
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
    ...choralFlight("Voices of Sea & Sky", "2026-10-05", "2026-10-12"),
    ...choralFlight("El Mesias", "2026-11-23", "2026-11-30"),
    ...choralFlight("Alzheimer's Stories", "2027-03-08", "2027-03-15"),
    ...choralFlight("Mass in Blue", "2027-05-03", "2027-05-10"),
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
      spec: { kind: "explicit_dates", dates: dates("2026-09-11", "2026-09-24") },
      pool: "AM Drive",
      flight: "Come From Away",
      start_date: "2026-09-08",
      end_date: "2026-09-27",
      stated_total: 2,
      source_text: "2 AM Drive Time Spots: 1 each day Sept 11, 24",
    }),
    line({
      label: "#1 Come From Away — ROS",
      spec: {
        kind: "explicit_dates",
        dates: dates(
          "2026-09-09",
          "2026-09-10",
          "2026-09-11",
          "2026-09-15",
          "2026-09-17",
          "2026-09-18",
          "2026-09-24",
          "2026-09-25",
        ),
      },
      pool: "Total Program Rotation",
      flight: "Come From Away",
      start_date: "2026-09-08",
      end_date: "2026-09-27",
      stated_total: 8,
      source_text: "8 ROS spots: 1 each Sept. 9, 10, 11, 15, 17, 18, 24, 25",
    }),
    line({
      label: "#2 39 Steps — AM drive",
      spec: { kind: "explicit_dates", dates: dates("2026-10-16", "2026-10-22") },
      pool: "AM Drive",
      flight: "39 Steps",
      start_date: "2026-10-14",
      end_date: "2026-10-25",
      stated_total: 2,
      source_text: "2 AM Drive Time Spots: 1 each day: Oct 16, 22",
    }),
    line({
      label: "#2 39 Steps — ROS",
      spec: {
        kind: "explicit_dates",
        dates: dates(
          "2026-10-14",
          "2026-10-15",
          "2026-10-16",
          "2026-10-20",
          "2026-10-21",
          "2026-10-22",
          "2026-10-23",
        ),
      },
      pool: "Total Program Rotation",
      flight: "39 Steps",
      start_date: "2026-10-14",
      end_date: "2026-10-25",
      stated_total: 7,
      source_text: "7 ROS spots: 1 each: Oct 14, 15, 16, 20, 21,22, 23",
    }),
    line({
      label: "#3 Million Dollar Quartet Christmas — AM drive",
      spec: {
        kind: "explicit_dates",
        dates: dates(
          "2026-12-02",
          "2026-12-03",
          "2026-12-04",
          "2026-12-10",
          "2026-12-11",
          ...range("2026-12-14", "2026-12-18"),
        ),
      },
      pool: "AM Drive",
      flight: "Million Dollar Quartet Christmas",
      start_date: "2026-12-02",
      end_date: "2026-12-20",
      stated_total: 10,
      source_text: "10 AM Drive: 1 each Dec 2,3,4, 10,11, 14-18",
    }),
    line({
      label: "#3 Million Dollar Quartet Christmas — ROS",
      spec: { kind: "explicit_dates", dates: dates("2026-12-03", "2026-12-10", "2026-12-17") },
      pool: "Total Program Rotation",
      flight: "Million Dollar Quartet Christmas",
      start_date: "2026-12-02",
      end_date: "2026-12-20",
      stated_total: 3,
      source_text: "3 ROS spots: 1 each Dec. 3, 10 17",
    }),
    line({
      label: "#4 9 to 5 — AM drive",
      spec: { kind: "explicit_dates", dates: dates("2027-01-22", "2027-01-28") },
      pool: "AM Drive",
      flight: "9 to 5 The Musical",
      start_date: "2027-01-21",
      end_date: "2027-02-07",
      stated_total: 2,
      source_text: "2 AM Drive: 1 each: Jan 22, 28",
    }),
    line({
      label: "#4 9 to 5 — ROS",
      spec: {
        kind: "explicit_dates",
        dates: dates("2027-01-27", "2027-01-28", ...range("2027-02-01", "2027-02-05")),
      },
      pool: "Total Program Rotation",
      flight: "9 to 5 The Musical",
      start_date: "2027-01-21",
      end_date: "2027-02-07",
      stated_total: 7,
      source_text: "7 ROS: 1 each: Jan 27,28 Feb 1-5",
    }),
    line({
      label: "#5 Dear Jack, Dear Louise — AM drive",
      spec: { kind: "explicit_dates", dates: dates("2027-02-18", "2027-02-25") },
      pool: "AM Drive",
      flight: "Dear Jack, Dear Louise",
      start_date: "2027-02-17",
      end_date: "2027-02-28",
      stated_total: 2,
      source_text: "2 AM Drive: 1 each Feb 18, 25",
    }),
    line({
      label: "#5 Dear Jack, Dear Louise — ROS",
      spec: {
        kind: "explicit_dates",
        dates: dates(...range("2027-02-17", "2027-02-19"), ...range("2027-02-22", "2027-02-26")),
      },
      pool: "Total Program Rotation",
      flight: "Dear Jack, Dear Louise",
      start_date: "2027-02-17",
      end_date: "2027-02-28",
      stated_total: 8,
      source_text: "8 ROS: Feb 17-19, 22-26",
    }),
    line({
      label: "#6 Frozen — AM drive",
      spec: {
        kind: "explicit_dates",
        dates: dates(
          "2027-05-06",
          "2027-05-07",
          ...range("2027-05-12", "2027-05-14"),
          ...range("2027-05-17", "2027-05-21"),
        ),
      },
      pool: "AM Drive",
      flight: "Frozen: The Musical",
      start_date: "2027-05-06",
      end_date: "2027-05-23",
      stated_total: 10,
      source_text: "10 AM Drive: 1 cach May 6,7, 12-14, 17-21",
    }),
    line({
      label: "#6 Frozen — ROS",
      spec: { kind: "explicit_dates", dates: dates("2027-05-07", "2027-05-14", "2027-05-21") },
      pool: "Total Program Rotation",
      flight: "Frozen: The Musical",
      start_date: "2027-05-06",
      end_date: "2027-05-23",
      stated_total: 3,
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
      spec: { kind: "explicit_dates", dates: dates("2026-05-18", "2026-05-20", "2026-05-22") },
      pool: "AM Drive",
      time_mode: "window",
      window_start: "06:00",
      window_end: "10:00",
      start_date: "2026-05-18",
      end_date: "2026-05-22",
      stated_total: 3,
      source_text: "Mon/Wed/Fri 6:00 AM – 10:00 AM, 30 secs, 1 each",
    }),
    line({
      label: "10:00 AM–3:00 PM",
      spec: { kind: "explicit_dates", dates: dates("2026-05-18", "2026-05-20", "2026-05-22") },
      pool: "Mid-day",
      time_mode: "window",
      window_start: "10:00",
      window_end: "15:00",
      start_date: "2026-05-18",
      end_date: "2026-05-22",
      stated_total: 3,
      source_text: "Mon/Wed/Fri 10:00 AM – 3:00 PM, 30 secs, 1 each",
    }),
    line({
      label: "3:00–7:00 PM",
      spec: { kind: "explicit_dates", dates: dates("2026-05-18", "2026-05-20", "2026-05-22") },
      pool: "PM Drive",
      time_mode: "window",
      window_start: "15:00",
      window_end: "19:00",
      start_date: "2026-05-18",
      end_date: "2026-05-22",
      stated_total: 3,
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
      spec: { kind: "fixed_days", count_per_day: 2 },
      days_of_week: [5],
      program: "Putumayo World Music Hour",
      time_mode: "window",
      window_start: "19:00",
      window_end: "20:00",
      start_date: "2026-04-06",
      end_date: "2026-06-21",
      stated_total: 22,
      source_text: "F 7:00p- 8:00p, 15s, 2 per week x 11 weeks — PUTUMAYO WORLD MUSIC",
    }),
  ],
};

/** FPM / Florida Power & Light, 1/26–12/27/26: a 48-column week grid, five lines, dark weeks, a bonus line (corpus #9). */
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
      spec: { kind: "week_grid", weeks: grid("2026-01-26", FPL_AM) },
      days_of_week: WEEKDAYS,
      max_per_day: 2,
      pool: "AM Drive",
      time_mode: "window",
      window_start: "05:00",
      window_end: "09:00",
      start_date: "2026-01-26",
      end_date: "2026-12-27",
      stated_total: 108,
      source_text: "38 MTuWThF 5:00a- 9:00a AM … 108",
    }),
    line({
      label: "PM 3:00p–6:00p M–F",
      spec: { kind: "week_grid", weeks: grid("2026-01-26", FPL_PM) },
      days_of_week: WEEKDAYS,
      max_per_day: 2,
      pool: "PM Drive",
      time_mode: "window",
      window_start: "15:00",
      window_end: "18:00",
      start_date: "2026-01-26",
      end_date: "2026-12-27",
      stated_total: 96,
      source_text: "39 MTuWThF 3:00p- 6:00p PM … 96",
    }),
    line({
      label: "RT 9:00a–3:00p M–F",
      spec: { kind: "week_grid", weeks: grid("2026-01-26", FPL_RT) },
      days_of_week: WEEKDAYS,
      max_per_day: 2,
      pool: "Mid-day",
      time_mode: "window",
      window_start: "09:00",
      window_end: "15:00",
      start_date: "2026-01-26",
      end_date: "2026-12-27",
      stated_total: 84,
      source_text: "40 MTuWThF 9:00a- 3:00p RT … 84",
    }),
    line({
      label: "WK Sa 8:00a–12:00p",
      spec: { kind: "week_grid", weeks: grid("2026-01-26", FPL_WK) },
      days_of_week: [6],
      pool: "Weekend Edition",
      time_mode: "window",
      window_start: "08:00",
      window_end: "12:00",
      start_date: "2026-01-26",
      end_date: "2026-12-27",
      stated_total: 72,
      source_text: "41 Sa 8:00a-12:00p WK … 72",
    }),
    line({
      label: "BN bonus 5:00a–12:00a",
      spec: { kind: "week_grid", weeks: grid("2026-01-26", FPL_BN) },
      pool: "Total Program Rotation",
      service_level: "bonus",
      start_date: "2026-01-26",
      end_date: "2026-12-27",
      stated_total: 180,
      source_text: "42 MTuWThFSaSu 5:00a-12:00a BN $0.00 … 180",
    }),
  ],
};

/** Pensacola Symphony 2025-26, updated IO: five event flights; #5 (the gala) cancelled, replaced by May 11–15 for the Jazz Brunch — after the order's own April 25 end date (corpus #7). */
export const SYMPHONY: FixtureOrder = {
  name: "Pensacola Symphony Orchestra 2025-26",
  effective_from: "2025-09-29",
  effective_to: "2026-04-25",
  stated_total_spots: 28,
  affidavit_required: true,
  makegood_requires_agency_approval: false,
  separation_source_text: null,
  lines: [
    line({
      label: "#1 Opening Night — AM",
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: WEEKDAYS,
      pool: "AM Drive",
      flight: "Opening Night",
      start_date: "2025-09-29",
      end_date: "2025-10-03",
      stated_total: 5,
      source_text: "5 AM Drive Total: 1 AM Drive each day: Sept 29-Oct 3",
    }),
    line({
      label: "#2 Classically Connected — AM",
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: WEEKDAYS,
      pool: "AM Drive",
      flight: "Classically Connected",
      start_date: "2025-11-03",
      end_date: "2025-11-07",
      stated_total: 5,
      source_text: "1 AM Drive each: Nov 3-7",
    }),
    line({
      label: "#2 Classically Connected — PM",
      spec: { kind: "explicit_dates", dates: dates("2025-11-06") },
      pool: "PM Drive",
      flight: "Classically Connected",
      start_date: "2025-11-03",
      end_date: "2025-11-07",
      stated_total: 1,
      source_text: "1 PM Drive spot Nov 6",
    }),
    line({
      label: "#3 Mahler — AM",
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: WEEKDAYS,
      pool: "AM Drive",
      flight: "Mahler",
      start_date: "2026-03-02",
      end_date: "2026-03-06",
      stated_total: 5,
      source_text: "1 each March 2-6",
    }),
    line({
      label: "#3 Mahler — PM",
      spec: { kind: "explicit_dates", dates: dates("2026-03-06") },
      pool: "PM Drive",
      flight: "Mahler",
      start_date: "2026-03-02",
      end_date: "2026-03-06",
      stated_total: 1,
      source_text: "1 PM Drive spot March 6",
    }),
    line({
      label: "#4 Symphonic Spectacular — AM",
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: WEEKDAYS,
      pool: "AM Drive",
      flight: "Symphonic Spectacular",
      start_date: "2026-03-23",
      end_date: "2026-03-27",
      stated_total: 5,
      source_text: "1 each March 23-27",
    }),
    line({
      label: "#4 Symphonic Spectacular — PM",
      spec: { kind: "explicit_dates", dates: dates("2026-03-27") },
      pool: "PM Drive",
      flight: "Symphonic Spectacular",
      start_date: "2026-03-23",
      end_date: "2026-03-27",
      stated_total: 1,
      source_text: "1 PM Drive spot March 27",
    }),
    line({
      label: "#5 100th Anniversary Gala — AM (cancelled)",
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: WEEKDAYS,
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
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: WEEKDAYS,
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
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: WEEKDAYS,
      pool: "AM Drive",
      start_date: "2026-05-04",
      end_date: "2026-06-21",
      stated_total: 35,
      source_text: "May 4-June 21 5 AM Drive : 1 each Mon-Friday",
    }),
    line({
      label: "May 4 – Jun 21 — PM (Wed or Thu)",
      spec: { kind: "weekly_quota", quantity: 1 },
      days_of_week: [3, 4],
      max_per_day: 1,
      pool: "PM Drive",
      start_date: "2026-05-04",
      end_date: "2026-06-21",
      stated_total: 7,
      source_text: "1 PM Drive: Wed or Thursday",
    }),
    line({
      label: "Jun 22 – Jul 5 — AM",
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: WEEKDAYS,
      pool: "AM Drive",
      start_date: "2026-06-22",
      end_date: "2026-07-05",
      stated_total: 10,
      source_text: "June 22 - July 5 5 AM Drive: 1 each Mon-Friday",
    }),
    line({
      label: "Jun 22 – Jul 5 — PM",
      spec: {
        kind: "explicit_dates",
        dates: dates("2026-06-24", "2026-06-25", "2026-07-01", "2026-07-02"),
      },
      pool: "PM Drive",
      start_date: "2026-06-22",
      end_date: "2026-07-05",
      stated_total: 4,
      source_text: "4 PM Drive: 1 each June 24,25 July 1,2",
    }),
  ],
};

// The second brief's corpus (§12) --------------------------------------------

/** Fireman Termite & Pest Control, 5/18/26–5/16/27: a fixed weekly Carpool credit plus one ROS credit every other week (corpus #2). */
export const FIREMAN_TERMITE: FixtureOrder = {
  name: "Fireman Termite and Pest Control",
  effective_from: "2026-05-18",
  effective_to: "2027-05-16",
  stated_total_spots: 78,
  affidavit_required: false,
  makegood_requires_agency_approval: false,
  separation_source_text: null,
  lines: [
    line({
      label: "Carpool Wednesday",
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: [3],
      pool: "Carpool",
      time_mode: "exact",
      preferred_time: "08:44",
      start_date: "2026-05-18",
      end_date: "2027-05-16",
      stated_total: 52,
      source_text: "1 spot in Carpool on Wednesday @ 8:44 AM for 52 weeks",
    }),
    line({
      label: "ROS every other week",
      spec: { kind: "every_n_weeks", interval_weeks: 2, quantity: 1 },
      pool: "Total Program Rotation",
      start_date: "2026-05-18",
      end_date: "2027-05-16",
      stated_total: 26,
      source_text: "26 ROS spots to air every other week Monday-Sunday",
    }),
  ],
};

/** Florida Department of Health, Escambia, 7/1/26–6/27/27: 4 Drive Time a week, Monday–Friday, 1 a day (corpus #3). */
export const FDOH_ESCAMBIA: FixtureOrder = {
  name: "Florida Dept of Health Escambia",
  effective_from: "2026-07-01",
  effective_to: "2027-06-27",
  stated_total_spots: null,
  affidavit_required: true,
  makegood_requires_agency_approval: false,
  separation_source_text: null,
  lines: [
    line({
      label: "Drive Time, 4 a week",
      spec: { kind: "weekly_quota", quantity: 4 },
      days_of_week: WEEKDAYS,
      max_per_day: 1,
      pool: "Drive Time",
      start_date: "2026-07-01",
      end_date: "2027-06-27",
      source_text: "4 Drive Time spots per week: 1 per day; Mon-Friday",
    }),
  ],
};

/** Phil Hall, P.A. 2022-23, 6/20/22–6/18/23: exact Carpool, a Marketplace opening credit, a flexible TPR week, Saturday Weekend Edition (corpus #4). */
export const PHIL_HALL_2022: FixtureOrder = {
  name: "Phil Hall, P.A. 2022-23",
  effective_from: "2022-06-20",
  effective_to: "2023-06-18",
  stated_total_spots: null,
  affidavit_required: false,
  makegood_requires_agency_approval: false,
  separation_source_text: null,
  copy: [
    { label: "Copy 1", flight: null },
    { label: "Copy 2", flight: null },
    { label: "Copy 3", flight: null },
    { label: "Copy 4", flight: null },
    { label: "Carpool message", flight: null },
  ],
  lines: [
    line({
      label: "Carpool Tuesday 7:06",
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: [2],
      pool: "Carpool",
      time_mode: "exact",
      preferred_time: "07:06",
      start_date: "2022-06-20",
      end_date: "2023-06-18",
      stated_total: 52,
      source_text: "52 AM Drive Time spots in Carpool Plan: 1 each week on Tuesday 7:06 AM",
    }),
    line({
      label: "Marketplace opening credit, Wednesday",
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: [3],
      program: "Marketplace",
      time_mode: "slot",
      required_opportunity_key: "marketplace.opening",
      start_date: "2022-06-20",
      end_date: "2023-06-18",
      stated_total: 52,
      source_text:
        "52 PM Drive Time spots : 1 each week as Sponsor of Market Place on Wednesday @ 4:59 pm Opening Credit",
    }),
    line({
      label: "Total Program Rotation, Mon/Thu/Fri",
      spec: { kind: "weekly_quota", quantity: 1 },
      days_of_week: [1, 4, 5],
      max_per_day: 1,
      pool: "Total Program Rotation",
      start_date: "2022-06-20",
      end_date: "2023-06-18",
      stated_total: 52,
      source_text: "52 Total Program Rotation spots: 1 each week to air Monday, Thursday or Friday",
    }),
    line({
      label: "Weekend Edition Saturday 8–10",
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: [6],
      pool: "Weekend Edition",
      time_mode: "window",
      window_start: "08:00",
      window_end: "10:00",
      start_date: "2022-06-20",
      end_date: "2023-06-18",
      stated_total: 27,
      source_text: "27 Spots in Morning Weekend Edition: 1 each week Saturday (8-10 am)",
    }),
  ],
};

/** Phil Hall, P.A. 2024-25, 6/17/24–6/15/25: AM and PM rotating Monday–Friday, Weekend Edition either day (corpus #5). */
export const PHIL_HALL_2024: FixtureOrder = {
  name: "Phil Hall, P.A. 2024-25",
  effective_from: "2024-06-17",
  effective_to: "2025-06-15",
  stated_total_spots: 156,
  affidavit_required: false,
  makegood_requires_agency_approval: false,
  separation_source_text: null,
  lines: [
    line({
      label: "AM Drive, rotates Mon–Fri",
      spec: { kind: "weekly_quota", quantity: 1 },
      days_of_week: WEEKDAYS,
      max_per_day: 1,
      pool: "AM Drive",
      start_date: "2024-06-17",
      end_date: "2025-06-15",
      stated_total: 52,
      source_text: "52 AM Drive 1 spot each week rotates Monday-Friday",
    }),
    line({
      label: "PM Drive, rotates Mon–Fri",
      spec: { kind: "weekly_quota", quantity: 1 },
      days_of_week: WEEKDAYS,
      max_per_day: 1,
      pool: "PM Drive",
      start_date: "2024-06-17",
      end_date: "2025-06-15",
      stated_total: 52,
      source_text: "52 PM Drive 1 spot rotates each week Monday- Friday",
    }),
    line({
      label: "Weekend Edition, Sat or Sun 8–10",
      spec: { kind: "weekly_quota", quantity: 1 },
      days_of_week: [0, 6],
      max_per_day: 1,
      pool: "Weekend Edition",
      time_mode: "window",
      window_start: "08:00",
      window_end: "10:00",
      start_date: "2024-06-17",
      end_date: "2025-06-15",
      stated_total: 52,
      source_text:
        "52 spots : 1 each week in Weekend Edition Morning news, Saturday or Sunday AM (8 am-10 am)",
    }),
  ],
};

/** Pensacola Symphony 2021-22, 10/7/21–4/30/22: four event phases with one- and two-per-day ROS runs (corpus #6). The AM lines print "6" against five listed days, as the order does. */
function symphonyPhase(
  name: string,
  am: { dates: string[]; stated: number; text: string },
  ros: { one: string[]; two: string[]; stated: number; text: string },
): FixtureLine[] {
  const first = [...am.dates, ...ros.one, ...ros.two].sort()[0]!;
  const last = [...am.dates, ...ros.one, ...ros.two].sort().at(-1)!;
  return [
    line({
      label: `${name} — AM`,
      spec: { kind: "explicit_dates", dates: dates(...am.dates) },
      pool: "AM Drive",
      flight: name,
      start_date: first,
      end_date: last,
      stated_total: am.stated,
      source_text: am.text,
    }),
    line({
      label: `${name} — ROS`,
      spec: {
        kind: "explicit_dates",
        dates: [...dates(...ros.one), ...ros.two.map((date) => ({ date, quantity: 2 }))],
      },
      pool: "Total Program Rotation",
      flight: name,
      start_date: first,
      end_date: last,
      stated_total: ros.stated,
      source_text: ros.text,
    }),
  ];
}

export const SYMPHONY_2021: FixtureOrder = {
  name: "Pensacola Symphony Orchestra 2021-22",
  effective_from: "2021-10-07",
  effective_to: "2022-04-30",
  stated_total_spots: 69,
  affidavit_required: true,
  makegood_requires_agency_approval: false,
  separation_source_text: null,
  lines: [
    ...symphonyPhase(
      "Opening Night",
      {
        dates: range("2021-10-11", "2021-10-15"),
        stated: 6,
        text: "6 AM Drive spots : 1 each day Oct 11-15",
      },
      {
        one: ["2021-10-07", "2021-10-08", "2021-10-11"],
        two: range("2021-10-12", "2021-10-15"),
        stated: 11,
        text: "11 ROS spots: 1 each day Oct 7, 8, 11 : 2 per day Oct 12-15",
      },
    ),
    ...symphonyPhase(
      "Variations & Virtuosity",
      {
        dates: range("2021-11-01", "2021-11-05"),
        stated: 6,
        text: "6 AM Drive spots: 1 each day Nov 1-5",
      },
      {
        one: ["2021-10-28", "2021-10-29", "2021-11-01"],
        two: range("2021-11-02", "2021-11-05"),
        stated: 11,
        text: "11 ROS spots: 1 each day Oct 28, 29, Nov 1; 2 each day Nov 2-5",
      },
    ),
    ...symphonyPhase(
      "Russian Spectacular",
      {
        dates: range("2022-02-28", "2022-03-04"),
        stated: 6,
        text: "6 AM Drive spots: 1 each day Feb. 28- March 4",
      },
      {
        one: ["2022-02-24", "2022-02-25", "2022-02-28"],
        two: range("2022-03-01", "2022-03-04"),
        stated: 11,
        text: "11 ROS spots : 1 each day Feb 24,25, 28; 2 each day March 1-4",
      },
    ),
    {
      ...line({
        label: "Sounds Triumphant — AM",
        spec: {
          kind: "explicit_dates",
          dates: [
            ...dates(...range("2022-04-25", "2022-04-28")),
            { date: "2022-04-29", quantity: 2 },
          ],
        },
        pool: "AM Drive",
        flight: "Sounds Triumphant",
        start_date: "2022-04-22",
        end_date: "2022-04-30",
        stated_total: 7,
        source_text: "7 AM Drive spots: 1 each day April 25-28; 2 spots April 29",
      }),
    },
    line({
      label: "Sounds Triumphant — ROS",
      spec: {
        kind: "explicit_dates",
        dates: [
          { date: "2022-04-22", quantity: 1 },
          ...range("2022-04-25", "2022-04-29").map((date) => ({ date, quantity: 2 })),
        ],
      },
      pool: "Total Program Rotation",
      flight: "Sounds Triumphant",
      start_date: "2022-04-22",
      end_date: "2022-04-30",
      stated_total: 11,
      source_text: "11 ROS spots : 1 spot April 22; 2 each day April 25-29",
    }),
  ],
};

/** FPM / The Atkins Group — San Antonio Shoemakers, 10/20/25–4/19/26: an alternating-week grid with a two-week dark run at the new year, plus alternating bonus weight (corpus #10). */
const SAS_WK = [2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2];
const SAS_BN = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1];

export const SAN_ANTONIO_SHOEMAKERS: FixtureOrder = {
  name: "FPM — Atkins — San Antonio Shoemakers",
  effective_from: "2025-10-20",
  effective_to: "2026-04-19",
  stated_total_spots: 39,
  affidavit_required: true,
  makegood_requires_agency_approval: true,
  separation_source_text: "3",
  lines: [
    line({
      label: "WK SaSu 10:00a–4:00p",
      spec: { kind: "week_grid", weeks: grid("2025-10-20", SAS_WK) },
      days_of_week: [0, 6],
      pool: "Weekend ROS",
      time_mode: "window",
      window_start: "10:00",
      window_end: "16:00",
      start_date: "2025-10-20",
      end_date: "2026-04-19",
      stated_total: 26,
      source_text: "13 SaSu 10:00a- 4:00p WK … 26 — WEEKEND ROS",
    }),
    line({
      label: "BN ROS 5:00a–12:00a",
      spec: { kind: "week_grid", weeks: grid("2025-10-20", SAS_BN) },
      pool: "Total Program Rotation",
      service_level: "bonus",
      start_date: "2025-10-20",
      end_date: "2026-04-19",
      stated_total: 13,
      source_text: "14 MTuWThFSaSu 5:00a-12:00a BN $0.00 … 13 — ROS",
    }),
  ],
};

/** New South Window Solutions, 8/11/25–8/23/26 (rev 3): 27 selected weeks, each 10 AM + 10 PM + 6 weekend — two a day in a daypart is routine (corpus #11). */
const NEW_SOUTH_WEEKS = [
  "2025-08-11",
  "2025-08-18",
  "2025-09-01",
  "2025-09-08",
  "2025-10-06",
  "2025-10-20",
  "2025-11-03",
  "2025-11-17",
  "2025-12-01",
  "2025-12-08",
  "2026-01-05",
  "2026-01-19",
  "2026-02-02",
  "2026-02-16",
  "2026-03-02",
  "2026-03-16",
  "2026-04-06",
  "2026-04-20",
  "2026-05-04",
  "2026-05-18",
  "2026-06-01",
  "2026-06-15",
  "2026-06-22",
  "2026-07-06",
  "2026-07-20",
  "2026-08-03",
  "2026-08-17",
];
const newSouthGrid = (quantity: number) =>
  NEW_SOUTH_WEEKS.map((week_start) => ({ week_start, quantity }));

export const NEW_SOUTH_WINDOWS: FixtureOrder = {
  name: "New South Window Solutions",
  effective_from: "2025-08-11",
  effective_to: "2026-08-23",
  stated_total_spots: 702,
  affidavit_required: false,
  makegood_requires_agency_approval: true,
  separation_source_text: null,
  lines: [
    line({
      label: "AM 6A–9A M–F, 10 a week",
      spec: { kind: "week_grid", weeks: newSouthGrid(10) },
      days_of_week: WEEKDAYS,
      pool: "AM Drive",
      time_mode: "window",
      window_start: "06:00",
      window_end: "09:00",
      start_date: "2025-08-11",
      end_date: "2026-08-23",
      stated_total: 270,
      source_text: "08/11/25 M-F 6A-9A $44 10 $440 … 270 AM Drive spots",
    }),
    line({
      label: "PM 3P–7P M–F, 10 a week",
      spec: { kind: "week_grid", weeks: newSouthGrid(10) },
      days_of_week: WEEKDAYS,
      pool: "PM Drive",
      time_mode: "window",
      window_start: "15:00",
      window_end: "19:00",
      start_date: "2025-08-11",
      end_date: "2026-08-23",
      stated_total: 270,
      source_text: "08/11/25 M-F 3P-7P $44 10 $440 … 270 PM Drive spots",
    }),
    line({
      label: "SaSu 10A–4P, 6 a week",
      spec: { kind: "week_grid", weeks: newSouthGrid(6) },
      days_of_week: [0, 6],
      pool: "Mid-day",
      time_mode: "window",
      window_start: "10:00",
      window_end: "16:00",
      start_date: "2025-08-11",
      end_date: "2026-08-23",
      stated_total: 162,
      source_text: "08/11/25 SaSu 10A-4P $26 6 $156 … 162 Mid-day Sat/Sun spots",
    }),
  ],
};

/** Cultural Arts Alliance of Walton County, 4/13–5/31/26: a weekly AM quota, a ROS quota, an exact Carpool slot, and Tuesday/Thursday AM placements (corpus #12). */
export const CULTURAL_ARTS_ALLIANCE: FixtureOrder = {
  name: "Cultural Arts Alliance",
  effective_from: "2026-04-13",
  effective_to: "2026-05-31",
  stated_total_spots: 34,
  affidavit_required: false,
  makegood_requires_agency_approval: false,
  separation_source_text: null,
  lines: [
    line({
      label: "ArtsQuest — AM Drive, 5 a week",
      spec: { kind: "weekly_quota", quantity: 5 },
      days_of_week: WEEKDAYS,
      pool: "AM Drive",
      flight: "ArtsQuest Fine Arts Festival",
      start_date: "2026-04-13",
      end_date: "2026-05-03",
      stated_total: 15,
      source_text: "15 AM DRIVE TIME SPOTS: 5 AM Drive each week of April 13, 20, 27",
    }),
    line({
      label: "ArtsQuest — ROS, 2 a week",
      spec: { kind: "weekly_quota", quantity: 2 },
      pool: "Total Program Rotation",
      flight: "ArtsQuest Fine Arts Festival",
      start_date: "2026-04-13",
      end_date: "2026-05-03",
      stated_total: 6,
      source_text: "6 TOTAL PROGRAM ROTATION SPOTS: 2 ROS each week of April 13, 20, 27",
    }),
    line({
      label: "Arts Month — Carpool Wednesday 8:49",
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: [3],
      pool: "Carpool",
      time_mode: "exact",
      preferred_time: "08:49",
      flight: "Arts Month",
      start_date: "2026-04-29",
      end_date: "2026-05-27",
      stated_total: 5,
      source_text: "5 Carpool Spots to air each Wed @8:49 AM April 29-May 27",
    }),
    line({
      label: "Arts Month — AM Drive Tue & Thu",
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: [2, 4],
      pool: "AM Drive",
      flight: "Arts Month",
      start_date: "2026-05-01",
      end_date: "2026-05-31",
      stated_total: 8,
      source_text: "8 AM Drive Time spots: 2 AM Drive each week on Tuesday & Thursday",
    }),
  ],
};

/** Wild Birds Unlimited, 2/23/26–2/21/27: one BirdNote sponsorship a week at 7:42, whose weekday changes every 13 weeks (corpus #13). */
function wildBirdsPhase(day: number, dayName: string, start: string, end: string): FixtureLine {
  return line({
    label: `BirdNote, ${dayName}s`,
    spec: { kind: "fixed_days", count_per_day: 1 },
    days_of_week: [day],
    program: "Morning Edition",
    time_mode: "slot",
    required_opportunity_key: "morning-edition.birdnote",
    start_date: start,
    end_date: end,
    stated_total: 13,
    source_text: `13 weeks on ${dayName} ${start} – ${end}, @7:42 as Sponsor of Bird Notes`,
  });
}

export const WILD_BIRDS_UNLIMITED: FixtureOrder = {
  name: "Wild Birds Unlimited",
  effective_from: "2026-02-23",
  effective_to: "2027-02-21",
  stated_total_spots: 52,
  affidavit_required: true,
  makegood_requires_agency_approval: false,
  separation_source_text: null,
  lines: [
    wildBirdsPhase(1, "Monday", "2026-02-23", "2026-05-24"),
    wildBirdsPhase(2, "Tuesday", "2026-05-25", "2026-08-23"),
    wildBirdsPhase(3, "Wednesday", "2026-08-24", "2026-11-22"),
    wildBirdsPhase(4, "Thursday", "2026-11-23", "2027-02-21"),
  ],
};

/** N. West Moss, 7/25–10/18/26: 13 opening credits for Five Corners — a position, not a time (corpus #14). */
export const WEST_MOSS: FixtureOrder = {
  name: "West Moss",
  effective_from: "2026-07-25",
  effective_to: "2026-10-18",
  stated_total_spots: 13,
  affidavit_required: false,
  makegood_requires_agency_approval: false,
  separation_source_text: null,
  lines: [
    line({
      label: "Five Corners opening credit",
      spec: { kind: "weekly_quota", quantity: 1 },
      program: "Five Corners",
      time_mode: "slot",
      required_opportunity_key: "five-corners.opening",
      start_date: "2026-07-25",
      end_date: "2026-10-18",
      stated_total: 13,
      source_text: "13 Opening Credits for Five Corners",
    }),
  ],
};

/** International Paper, 5/4/26–5/2/27: three a week — a Living on Earth closing credit, a rotating AM/PM drive credit, a Science Friday credit (corpus #14). */
export const INTERNATIONAL_PAPER: FixtureOrder = {
  name: "International Paper",
  effective_from: "2026-05-04",
  effective_to: "2027-05-02",
  stated_total_spots: 156,
  affidavit_required: false,
  makegood_requires_agency_approval: false,
  separation_source_text: null,
  lines: [
    line({
      label: "Living on Earth closing credit, Sunday",
      spec: { kind: "weekly_quota", quantity: 1 },
      days_of_week: [0],
      program: "Living on Earth",
      time_mode: "slot",
      required_opportunity_key: "living-on-earth.closing",
      start_date: "2026-05-04",
      end_date: "2027-05-02",
      stated_total: 52,
      source_text: "1 spot Closing Credit in Living on Earth Sunday",
    }),
    line({
      label: "Rotating AM/PM drive",
      spec: { kind: "weekly_quota", quantity: 1 },
      days_of_week: WEEKDAYS,
      max_per_day: 1,
      pool: "Drive Time",
      start_date: "2026-05-04",
      end_date: "2027-05-02",
      stated_total: 52,
      source_text: "1 Rotating AM/PM Drive",
    }),
    line({
      label: "Science Friday",
      spec: { kind: "weekly_quota", quantity: 1 },
      days_of_week: [5],
      program: "Science Friday",
      start_date: "2026-05-04",
      end_date: "2027-05-02",
      stated_total: 52,
      source_text: "1 Science Friday",
    }),
  ],
};

/** Phil Hall, P.A. 2020-21, 6/22/20–6/20/21: phased weekday lines, a Marketplace position, a Science Friday closing spot, ROS split weekday/weekend, and a bonus block "TBD" (corpus #14). */
export const PHIL_HALL_2020: FixtureOrder = {
  name: "Phil Hall, P.A. 2020-21",
  effective_from: "2020-06-22",
  effective_to: "2021-06-20",
  stated_total_spots: null,
  affidavit_required: false,
  makegood_requires_agency_approval: false,
  separation_source_text: null,
  lines: [
    line({
      label: "AM Drive Monday, 13 weeks",
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: [1],
      pool: "AM Drive",
      start_date: "2020-06-22",
      end_date: "2020-09-20",
      stated_total: 13,
      source_text: "13 AM Drive spots air: 1 each week Monday",
    }),
    line({
      label: "AM Drive Tuesday, 8 weeks",
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: [2],
      pool: "AM Drive",
      start_date: "2020-06-22",
      end_date: "2020-08-16",
      stated_total: 8,
      source_text: "8 AM Drive Spots air: 1 each week Tuesday",
    }),
    line({
      label: "AM Drive Thursday, 52 weeks",
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: [4],
      pool: "AM Drive",
      start_date: "2020-06-22",
      end_date: "2021-06-20",
      stated_total: 52,
      source_text: "52 AM Drive spots: 1 each week Thursday",
    }),
    line({
      label: "Marketplace Wednesday @ 5 pm, 39 weeks",
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: [3],
      program: "Marketplace",
      time_mode: "slot",
      required_opportunity_key: "marketplace.opening",
      start_date: "2020-06-22",
      end_date: "2021-03-21",
      stated_total: 39,
      source_text: "39 PM Drive spots: 1 each week Marketplace Wednesday @ 5 pm",
    }),
    line({
      label: "Science Friday closing spot, 13 weeks",
      spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: [5],
      program: "Science Friday",
      time_mode: "slot",
      required_opportunity_key: "science-friday.closing",
      start_date: "2020-06-22",
      end_date: "2020-09-20",
      stated_total: 13,
      source_text: "13 Mid-day spots: 1 each week Closing spot for Science Friday",
    }),
    line({
      label: "ROS weekdays, 26 weeks",
      spec: { kind: "weekly_quota", quantity: 1 },
      days_of_week: WEEKDAYS,
      max_per_day: 1,
      pool: "Total Program Rotation",
      start_date: "2020-06-22",
      end_date: "2020-12-20",
      stated_total: 26,
      source_text: "26 ROS spots rotate through M-Friday",
    }),
    line({
      label: "ROS weekends, 26 weeks",
      spec: { kind: "weekly_quota", quantity: 1 },
      days_of_week: [0, 6],
      max_per_day: 1,
      pool: "Total Program Rotation",
      start_date: "2020-06-22",
      end_date: "2020-12-20",
      stated_total: 26,
      source_text: "26 ROS spots rotate between Sat/Sun",
    }),
    line({
      label: "COVID bonus for nonprofit, TBD",
      spec: { kind: "range_total", quantity: 84 },
      pool: "Total Program Rotation",
      service_level: "bonus",
      start_date: "2020-06-22",
      end_date: "2021-06-20",
      stated_total: 84,
      source_text: "84 COVID Bonus for Nonprofit –TBD",
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
  FIREMAN_TERMITE,
  FDOH_ESCAMBIA,
  PHIL_HALL_2022,
  PHIL_HALL_2024,
  SYMPHONY_2021,
  SAN_ANTONIO_SHOEMAKERS,
  NEW_SOUTH_WINDOWS,
  CULTURAL_ARTS_ALLIANCE,
  WILD_BIRDS_UNLIMITED,
  WEST_MOSS,
  INTERNATIONAL_PAPER,
  PHIL_HALL_2020,
];
