// The airtime envelope — pure, no Supabase. docs/bookings-design.md §2.5 and
// §8: net capacity is the clocks' university-eligible avail minutes a week
// (read through bk_university_avails_per_week()), the station's contribution
// is the plan's contributed minutes, what is spoken for is the pins On Air
// already carries (and, from slice 3, commitments and Traffic's sales), and
// the remainder is Traffic's to sell. Nothing here places an avail.

import { roundTo } from "@/lib/money";

export interface AirtimeProgramRead {
  program_id: string;
  name: string;
  avails_per_week: number;
  minutes_per_week: number;
  pinned_minutes_per_week: number;
}

export interface AirtimeRead {
  as_of: string;
  programs: AirtimeProgramRead[];
}

export interface AirtimeEnvelope {
  /** University-eligible avails a week across every scheduled program. */
  availsPerWeek: number;
  /** Those avails' minutes a week — the airtime net capacity. */
  eligibleMinutesPerWeek: number;
  /** Minutes the clocks' pinned content already takes in those avails. */
  pinnedMinutesPerWeek: number;
  /** The executive's contributed envelope (the plan's figure). */
  contributedMinutesPerWeek: number;
  /** Eligible − pinned − contributed: Traffic's to sell. Negative means the envelope exceeds the inventory. */
  sellableMinutesPerWeek: number;
  /** The contributed envelope as a share of eligible minutes, or null with no inventory. */
  contributedShare: number | null;
  programs: AirtimeProgramRead[];
}

export function airtimeEnvelope(
  read: AirtimeRead | null,
  contributedMinutesPerWeek: number,
): AirtimeEnvelope {
  const programs = read?.programs ?? [];
  const availsPerWeek = programs.reduce((total, p) => total + Number(p.avails_per_week), 0);
  const eligible = round1(programs.reduce((total, p) => total + Number(p.minutes_per_week), 0));
  const pinned = round1(
    programs.reduce((total, p) => total + Number(p.pinned_minutes_per_week), 0),
  );
  return {
    availsPerWeek,
    eligibleMinutesPerWeek: eligible,
    pinnedMinutesPerWeek: pinned,
    contributedMinutesPerWeek,
    sellableMinutesPerWeek: round1(eligible - pinned - contributedMinutesPerWeek),
    contributedShare: eligible > 0 ? round4(contributedMinutesPerWeek / eligible) : null,
    programs,
  };
}

/** The boundary read's payload as the typed read, or null for an error payload. */
export function parseAirtimeRead(payload: unknown): AirtimeRead | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (record.ok !== true || typeof record.as_of !== "string" || !Array.isArray(record.programs)) {
    return null;
  }
  const programs: AirtimeProgramRead[] = [];
  for (const entry of record.programs) {
    if (!entry || typeof entry !== "object") continue;
    const p = entry as Record<string, unknown>;
    if (typeof p.program_id !== "string" || typeof p.name !== "string") continue;
    programs.push({
      program_id: p.program_id,
      name: p.name,
      avails_per_week: Number(p.avails_per_week ?? 0),
      minutes_per_week: Number(p.minutes_per_week ?? 0),
      pinned_minutes_per_week: Number(p.pinned_minutes_per_week ?? 0),
    });
  }
  return { as_of: record.as_of, programs };
}

/** "12 min", "1 h 30 min". */
export function formatMinutes(minutes: number): string {
  const whole = Math.round(minutes * 10) / 10;
  if (Math.abs(whole) < 60) return `${trim(whole)} min`;
  const hours = Math.floor(Math.abs(whole) / 60) * Math.sign(whole);
  const rest = round1(Math.abs(whole) - Math.abs(hours) * 60);
  return rest === 0 ? `${hours} h` : `${hours} h ${trim(rest)} min`;
}

function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function round1(value: number): number {
  return roundTo(value, 1);
}

function round4(value: number): number {
  return roundTo(value, 4);
}

// Commitments (slice 3) -------------------------------------------------------------------------------
// A project's airtime commitment is airings a week × seconds over a date
// range, contributed from the envelope or paid (§2.5). The envelope check
// runs before the executive approves: contributed commitments active in the
// term against the plan's contributed minutes a week.

export interface CommitmentLike {
  airings_per_week: number;
  seconds: number;
  treatment: "contributed" | "paid";
  starts_on: string;
  ends_on: string | null;
}

/** Airings × length, in minutes a week. */
export function commitmentMinutesPerWeek(commitment: CommitmentLike): number {
  return round1((Number(commitment.airings_per_week) * Number(commitment.seconds)) / 60);
}

/** Whether a commitment's dates overlap a term. */
export function commitmentInTerm(
  commitment: CommitmentLike,
  term: { starts_on: string; ends_on: string },
): boolean {
  return (
    commitment.starts_on <= term.ends_on &&
    (commitment.ends_on === null || commitment.ends_on >= term.starts_on)
  );
}

export interface EnvelopeCheck {
  /** Contributed minutes a week already committed in the term. */
  committedMinutesPerWeek: number;
  /** The plan's contributed envelope. */
  contributedMinutesPerWeek: number;
  /** Envelope − committed. Negative means the envelope is over-committed. */
  remainingMinutesPerWeek: number;
  exceeded: boolean;
}

/** The contributed envelope against the term's contributed commitments (§2.5, §8). */
export function envelopeCheck(
  commitments: readonly CommitmentLike[],
  term: { starts_on: string; ends_on: string },
  contributedMinutesPerWeek: number,
): EnvelopeCheck {
  const committed = round1(
    commitments
      .filter((c) => c.treatment === "contributed" && commitmentInTerm(c, term))
      .reduce((total, c) => total + commitmentMinutesPerWeek(c), 0),
  );
  const remaining = round1(contributedMinutesPerWeek - committed);
  return {
    committedMinutesPerWeek: committed,
    contributedMinutesPerWeek,
    remainingMinutesPerWeek: remaining,
    exceeded: remaining < 0,
  };
}

// The second boundary read: what Traffic has scheduled and On Air pins.

export type HonoredCommitment =
  | {
      commitment_id: string;
      honored_in: "traffic";
      found: true;
      label: string;
      status: string;
      placements_in_term: number;
      seconds_in_term: number;
    }
  | {
      commitment_id: string;
      honored_in: "on_air";
      found: true;
      label: string;
      status: string;
      airings_per_week: number;
      seconds: number;
    }
  | { commitment_id: string; honored_in: "traffic" | "on_air"; found: false };

export interface HonoredRead {
  as_of: string;
  commitments: HonoredCommitment[];
}

/** bk_institutional_airtime_honored()'s payload as the typed read, or null for an error payload. */
export function parseHonoredRead(payload: unknown): HonoredRead | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (
    record.ok !== true ||
    typeof record.as_of !== "string" ||
    !Array.isArray(record.commitments)
  ) {
    return null;
  }
  const commitments: HonoredCommitment[] = [];
  for (const entry of record.commitments) {
    if (!entry || typeof entry !== "object") continue;
    const c = entry as Record<string, unknown>;
    if (typeof c.commitment_id !== "string") continue;
    if (c.honored_in !== "traffic" && c.honored_in !== "on_air") continue;
    if (c.found !== true) {
      commitments.push({ commitment_id: c.commitment_id, honored_in: c.honored_in, found: false });
      continue;
    }
    const label = typeof c.label === "string" ? c.label : "";
    const status = typeof c.status === "string" ? c.status : "";
    if (c.honored_in === "traffic") {
      commitments.push({
        commitment_id: c.commitment_id,
        honored_in: "traffic",
        found: true,
        label,
        status,
        placements_in_term: Number(c.placements_in_term ?? 0),
        seconds_in_term: Number(c.seconds_in_term ?? 0),
      });
    } else {
      commitments.push({
        commitment_id: c.commitment_id,
        honored_in: "on_air",
        found: true,
        label,
        status,
        airings_per_week: Number(c.airings_per_week ?? 0),
        seconds: Number(c.seconds ?? 0),
      });
    }
  }
  return { as_of: record.as_of, commitments };
}
