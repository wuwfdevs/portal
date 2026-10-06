// The airtime envelope — pure, no Supabase. docs/bookings-design.md §2.5 and
// §8: net capacity is the clocks' university-eligible avail minutes a week
// (read through bk_university_avails_per_week()), the station's contribution
// is the plan's contributed minutes, what is spoken for is the pins On Air
// already carries (and, from slice 3, commitments and Traffic's sales), and
// the remainder is Traffic's to sell. Nothing here places an avail.

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
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}
