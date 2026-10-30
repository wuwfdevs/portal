// Agreements and reserved blocks — pure, no Supabase, no React.
// docs/bookings-design.md §2.2 (the agreement row of the pricing table), §2.6,
// §3H, §5 "Partners" and §6.4 step 2. `bk_reserved_block_reserves()` in
// 20261006140000_bookings_partners_agreements.sql is reservedBlockState()'s
// SQL twin: a block nobody attached by its release deadline reads as released
// at query time, with no scheduled job. Keep the two in step.

import { isValidDateISO } from "@/lib/dates";
import { isValidEmail } from "@/lib/validation";
import type { BadgeVariant } from "@/components/ui/badge";
import { defineStatusMap } from "@/components/ui/status-badge";
import type { BkAgreementStatus, BkPricingTreatment } from "@/lib/database.types";
import { pluralize } from "@/lib/format";
import { clamp } from "@/lib/math";
import { trimToNull } from "@/lib/validation";
import { shiftDateISO } from "@/lib/log/timezone";
import { roundCents } from "@/lib/money";
import { commitmentMinutesPerWeek, type CommitmentLike } from "./airtime";
import type { LaborClassFlag } from "./pricing";
import type { BookingsRole } from "./roles";
import type { HoursByClass } from "./scheduling";

export const AGREEMENT_STATUS_LABEL: Record<BkAgreementStatus, string> = {
  draft: "Draft — awaiting approval",
  active: "Active",
  ended: "Ended",
};

export const AGREEMENT_STATUS_SHORT_LABEL: Record<BkAgreementStatus, string> = {
  draft: "Draft",
  active: "Active",
  ended: "Ended",
};

const AGREEMENT_STATUS_VARIANT: Record<BkAgreementStatus, BadgeVariant> = {
  draft: "warning",
  active: "success",
  ended: "muted",
};

export const AGREEMENT_STATUS = defineStatusMap<BkAgreementStatus>({
  draft: { label: AGREEMENT_STATUS_LABEL.draft, variant: AGREEMENT_STATUS_VARIANT.draft },
  active: { label: AGREEMENT_STATUS_LABEL.active, variant: AGREEMENT_STATUS_VARIANT.active },
  ended: { label: AGREEMENT_STATUS_LABEL.ended, variant: AGREEMENT_STATUS_VARIANT.ended },
});

export const AGREEMENT_STATUS_SHORT = defineStatusMap<BkAgreementStatus>({
  draft: { label: AGREEMENT_STATUS_SHORT_LABEL.draft, variant: AGREEMENT_STATUS_VARIANT.draft },
  active: { label: AGREEMENT_STATUS_SHORT_LABEL.active, variant: AGREEMENT_STATUS_VARIANT.active },
  ended: { label: AGREEMENT_STATUS_SHORT_LABEL.ended, variant: AGREEMENT_STATUS_VARIANT.ended },
});

// Reserved blocks ---------------------------------------------------------------------------------------

export interface ReservedBlockLike {
  id: string;
  pool_id: string;
  /** YYYY-MM-DD */
  date: string;
  window_start: string;
  window_end: string;
  project_id: string | null;
  booking_id?: string | null;
  released_at: string | null;
  kept_by: string | null;
}

export interface AgreementTermsLike {
  status: BkAgreementStatus;
  starts_on: string;
  ends_on: string;
  booking_deadline_days: number;
  release_deadline_days: number;
}

/**
 * A block's state, read at query time (§5): `booked` once a project took it;
 * `released` when released by hand or when its release deadline has passed
 * with no project and nobody keeping it; `kept` past that deadline because
 * the director kept it; otherwise `reserved`.
 */
export type ReservedBlockState = "reserved" | "kept" | "booked" | "released";

export const BLOCK_STATE_LABEL: Record<ReservedBlockState, string> = {
  reserved: "Reserved",
  kept: "Kept past deadline",
  booked: "Booked",
  released: "Released",
};

export const BLOCK_STATE_BADGE: Record<ReservedBlockState, BadgeVariant> = {
  reserved: "accent",
  kept: "warning",
  booked: "success",
  released: "muted",
};

/** The last day a block may still be attached: date − booking_deadline_days. */
export function bookingDeadline(
  block: Pick<ReservedBlockLike, "date">,
  agreement: Pick<AgreementTermsLike, "booking_deadline_days">,
): string {
  return shiftDateISO(block.date, -Math.max(0, Number(agreement.booking_deadline_days)));
}

/** The last day a block still reserves its window for the partner: date − release_deadline_days. */
export function releaseDeadline(
  block: Pick<ReservedBlockLike, "date">,
  agreement: Pick<AgreementTermsLike, "release_deadline_days">,
): string {
  return shiftDateISO(block.date, -Math.max(0, Number(agreement.release_deadline_days)));
}

export function reservedBlockState(
  block: ReservedBlockLike,
  agreement: Pick<AgreementTermsLike, "release_deadline_days">,
  todayISO: string,
): ReservedBlockState {
  if (block.released_at !== null) return "released";
  if (block.project_id !== null) return "booked";
  const deadline = releaseDeadline(block, agreement);
  if (todayISO <= deadline) return "reserved";
  return block.kept_by !== null ? "kept" : "released";
}

/**
 * Whether a block still holds its window against other partners (§6.4 step
 * 2). Only an active agreement's blocks reserve anything — a draft's are a
 * proposal the executive has not yet approved.
 */
export function blockReservesWindow(
  block: ReservedBlockLike,
  agreement: Pick<AgreementTermsLike, "status" | "release_deadline_days">,
  todayISO: string,
): boolean {
  if (agreement.status !== "active") return false;
  return reservedBlockState(block, agreement, todayISO) !== "released";
}

/** A block whose booking deadline has passed with no project — the partner's to lose, flagged on the agreement page. */
export function pastBookingDeadline(
  block: ReservedBlockLike,
  agreement: Pick<AgreementTermsLike, "booking_deadline_days" | "release_deadline_days">,
  todayISO: string,
): boolean {
  if (reservedBlockState(block, agreement, todayISO) !== "reserved") return false;
  return todayISO > bookingDeadline(block, agreement);
}

// Consumption -----------------------------------------------------------------------------------------------

export interface AgreementBookingLike {
  project_id: string | null;
  treatment: BkPricingTreatment;
  /** Already filtered to live bookings by the caller (bookingIsLive). */
  hours: HoursByClass;
}

export interface AgreementLike extends AgreementTermsLike {
  reserve_hours_allocated: number;
  funded_student_hours: number;
  airtime_minutes_per_week: number;
}

export interface Gauge {
  allowed: number;
  used: number;
  remaining: number;
  /** used ÷ allowed, clamped to [0, 1]; 0 when nothing is allowed. */
  share: number;
}

export interface AgreementConsumption {
  /** Professional hours (classes not charged in a strategic price) drawn by strategic bookings under the agreement. */
  reserve: Gauge;
  /** Hours of classes charged in a strategic price (students), any treatment. */
  students: Gauge;
  /** Contributed airtime committed by open projects under the agreement, minutes a week. */
  airtime: Gauge;
  blocks: Record<ReservedBlockState, number> & { total: number; pastBookingDeadline: number };
}

function gauge(allowed: number, used: number): Gauge {
  const a = roundCents(Number(allowed));
  const u = roundCents(used);
  return {
    allowed: a,
    used: u,
    remaining: roundCents(a - u),
    share: a > 0 ? clamp(u / a, 0, 1) : 0,
  };
}

/**
 * What an agreement's projects have drawn against its terms. `bookings` are
 * the live bookings of projects under the agreement; `commitments` the
 * contributed commitments of its open projects; `blocks` its reserved blocks.
 * `excludeProjectId` leaves one project out, so re-pricing it does not count
 * its own holds twice.
 */
export function agreementConsumption(input: {
  agreement: AgreementLike;
  bookings: readonly AgreementBookingLike[];
  classes: readonly LaborClassFlag[];
  commitments: readonly CommitmentLike[];
  blocks: readonly ReservedBlockLike[];
  todayISO: string;
  excludeProjectId?: string;
}): AgreementConsumption {
  const professional = new Set(
    input.classes.filter((cls) => !cls.charged_in_strategic).map((cls) => cls.id),
  );
  const student = new Set(
    input.classes.filter((cls) => cls.charged_in_strategic).map((cls) => cls.id),
  );
  const bookings = input.bookings.filter((b) => b.project_id !== input.excludeProjectId);
  let reserveUsed = 0;
  let studentUsed = 0;
  for (const booking of bookings) {
    for (const [classId, hours] of Object.entries(booking.hours)) {
      const value = Number(hours);
      if (value <= 0) continue;
      if (booking.treatment === "strategic" && professional.has(classId)) reserveUsed += value;
      if (student.has(classId)) studentUsed += value;
    }
  }
  const airtimeUsed = input.commitments
    .filter((c) => c.treatment === "contributed")
    .reduce((total, c) => total + commitmentMinutesPerWeek(c), 0);

  const blocks: AgreementConsumption["blocks"] = {
    reserved: 0,
    kept: 0,
    booked: 0,
    released: 0,
    total: input.blocks.length,
    pastBookingDeadline: 0,
  };
  for (const block of input.blocks) {
    blocks[reservedBlockState(block, input.agreement, input.todayISO)] += 1;
    if (pastBookingDeadline(block, input.agreement, input.todayISO))
      blocks.pastBookingDeadline += 1;
  }

  return {
    reserve: gauge(input.agreement.reserve_hours_allocated, reserveUsed),
    students: gauge(input.agreement.funded_student_hours, studentUsed),
    airtime: gauge(input.agreement.airtime_minutes_per_week, airtimeUsed),
    blocks,
  };
}

/**
 * §2.2's agreement row: whether the agreement's allocated reserve share still
 * covers an estimate's professional draw. Null when the estimate draws no
 * professional hours.
 */
export function agreementReserveCovers(
  draw: HoursByClass,
  classes: readonly LaborClassFlag[],
  consumption: Pick<AgreementConsumption, "reserve">,
): boolean | null {
  let asked = 0;
  for (const cls of classes) {
    if (cls.charged_in_strategic) continue;
    asked += Number(draw[cls.id] ?? 0);
  }
  if (asked <= 0) return null;
  return roundCents(asked) <= consumption.reserve.remaining;
}

// The proposal preview (§3H) ------------------------------------------------------------------------------

export interface ProposalDraw {
  /** Allocated hours as a share of the term's reserve; null without a term. */
  reserveShare: number | null;
  /** The term's reserve left for everyone else once this agreement is active; null without a term. */
  reserveRemainingAfter: number | null;
  /** Whether the allocation exceeds what the term's reserve has left. */
  reserveOverdrawn: boolean;
  /** The envelope's contributed minutes a week left once this agreement's allowance is counted; null without a term. */
  airtimeRemainingAfter: number | null;
  airtimeOverdrawn: boolean;
  /** Reserved blocks inside the term, by pool id. */
  blocksByPool: Record<string, number>;
  blocksInTerm: number;
}

/**
 * What an agreement would draw before signature: its reserve share against
 * the term's reserve as it stands, its airtime allowance against the
 * envelope's remainder, and the windows its blocks take.
 */
export function proposalDraw(
  agreement: Pick<AgreementLike, "reserve_hours_allocated" | "airtime_minutes_per_week">,
  blocks: readonly Pick<ReservedBlockLike, "pool_id" | "date">[],
  term: {
    starts_on: string;
    ends_on: string;
    reserveTotal: number;
    reserveRemaining: number;
    airtimeRemainingMinutesPerWeek: number;
  } | null,
): ProposalDraw {
  const allocated = Number(agreement.reserve_hours_allocated);
  const airtime = Number(agreement.airtime_minutes_per_week);
  const inTerm = term
    ? blocks.filter((b) => b.date >= term.starts_on && b.date <= term.ends_on)
    : [...blocks];
  const blocksByPool: Record<string, number> = {};
  for (const block of inTerm) blocksByPool[block.pool_id] = (blocksByPool[block.pool_id] ?? 0) + 1;
  if (!term) {
    return {
      reserveShare: null,
      reserveRemainingAfter: null,
      reserveOverdrawn: false,
      airtimeRemainingAfter: null,
      airtimeOverdrawn: false,
      blocksByPool,
      blocksInTerm: inTerm.length,
    };
  }
  const reserveRemainingAfter = roundCents(term.reserveRemaining - allocated);
  const airtimeRemainingAfter = roundCents(term.airtimeRemainingMinutesPerWeek - airtime);
  return {
    reserveShare: term.reserveTotal > 0 ? roundCents(allocated / term.reserveTotal) : null,
    reserveRemainingAfter,
    reserveOverdrawn: reserveRemainingAfter < 0,
    airtimeRemainingAfter,
    airtimeOverdrawn: airtimeRemainingAfter < 0,
    blocksByPool,
    blocksInTerm: inTerm.length,
  };
}

// The forms --------------------------------------------------------------------------------------------------

export interface PartnerFormValues {
  name: string;
  kind: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  defaultFundingIndex: string;
  notes: string;
}

export const PARTNER_NAME_MAX = 160;

/** Null when valid; otherwise the first problem, as a sentence. */
export function validatePartnerForm(values: PartnerFormValues): string | null {
  if (values.name.trim() === "") return "Give the partner a name.";
  if (values.name.trim().length > PARTNER_NAME_MAX)
    return `Keep the name under ${PARTNER_NAME_MAX} characters.`;
  if (!["uwf_unit", "external"].includes(values.kind))
    return "Say whether the partner is a UWF unit or outside the university.";
  if (values.contactEmail.trim() !== "" && !isValidEmail(values.contactEmail))
    return "The contact email doesn't look like an email address.";
  return null;
}

export interface AgreementFormValues {
  label: string;
  startsOn: string;
  endsOn: string;
  reserveHoursAllocated: string;
  fundedStudentHours: string;
  expectedVolume: string;
  bookingDeadlineDays: string;
  releaseDeadlineDays: string;
  blackoutNotes: string;
  directCostTreatment: string;
  capitalNotes: string;
  beyondEnvelopeNote: string;
  airtimeMinutesPerWeek: string;
  notes: string;
}

export const AGREEMENT_LABEL_MAX = 160;

function nonNegative(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  const parsed = Number(trimmed.replace(/[,\s]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** Null when valid; otherwise the first problem, as a sentence. */
export function validateAgreementForm(values: AgreementFormValues): string | null {
  if (values.label.trim() === "") return "Give the agreement a label.";
  if (values.label.trim().length > AGREEMENT_LABEL_MAX)
    return `Keep the label under ${AGREEMENT_LABEL_MAX} characters.`;
  if (!isValidDateISO(values.startsOn)) return "The first day must be a date.";
  if (!isValidDateISO(values.endsOn)) return "The last day must be a date.";
  if (values.endsOn < values.startsOn)
    return "The agreement must end on or after the day it starts.";
  if (nonNegative(values.reserveHoursAllocated) === null)
    return "The reserve share is a number of professional hours, zero or more.";
  if (nonNegative(values.fundedStudentHours) === null)
    return "Funded student hours is a number, zero or more.";
  for (const [value, label] of [
    [values.bookingDeadlineDays, "The booking deadline"],
    [values.releaseDeadlineDays, "The release deadline"],
  ] as const) {
    const days = nonNegative(value);
    if (days === null || !Number.isInteger(days)) return `${label} is a whole number of days.`;
  }
  const airtime = nonNegative(values.airtimeMinutesPerWeek);
  if (airtime === null || !Number.isInteger(airtime))
    return "The airtime allowance is a whole number of minutes a week.";
  return null;
}

/** The validated form as the row's columns. Call after validateAgreementForm(). */
export function agreementColumns(values: AgreementFormValues) {
  return {
    label: values.label.trim(),
    starts_on: values.startsOn,
    ends_on: values.endsOn,
    reserve_hours_allocated: nonNegative(values.reserveHoursAllocated) ?? 0,
    funded_student_hours: nonNegative(values.fundedStudentHours) ?? 0,
    expected_volume: trimToNull(values.expectedVolume),
    booking_deadline_days: nonNegative(values.bookingDeadlineDays) ?? 14,
    release_deadline_days: nonNegative(values.releaseDeadlineDays) ?? 7,
    blackout_notes: trimToNull(values.blackoutNotes),
    direct_cost_treatment: trimToNull(values.directCostTreatment),
    capital_notes: trimToNull(values.capitalNotes),
    beyond_envelope_note: trimToNull(values.beyondEnvelopeNote),
    airtime_minutes_per_week: nonNegative(values.airtimeMinutesPerWeek) ?? 0,
    notes: trimToNull(values.notes),
  };
}

// The dashboard --------------------------------------------------------------------------------------------

export interface AgreementActionItem {
  agreementId: string;
  partnerId: string;
  label: string;
  role: BookingsRole;
  kind: "approval_pending" | "blocks_past_booking_deadline";
  text: string;
}

/**
 * "Needs your action" for agreements (§3H): a draft awaiting the executive's
 * approval, and reserved blocks past their booking deadline for the director
 * to keep or let go. A member with no role sees every item.
 */
export function agreementActionItems(
  agreements: readonly (AgreementLike & {
    id: string;
    partner_id: string;
    label: string;
    blocks: readonly ReservedBlockLike[];
  })[],
  roles: readonly BookingsRole[],
  todayISO: string,
): AgreementActionItem[] {
  const items: AgreementActionItem[] = [];
  for (const agreement of agreements) {
    const base = {
      agreementId: agreement.id,
      partnerId: agreement.partner_id,
      label: agreement.label,
    };
    if (agreement.status === "draft") {
      items.push({
        ...base,
        role: "executive",
        kind: "approval_pending",
        text: "Agreement awaiting approval",
      });
    }
    if (agreement.status === "active") {
      const late = agreement.blocks.filter((b) =>
        pastBookingDeadline(b, agreement, todayISO),
      ).length;
      if (late > 0) {
        items.push({
          ...base,
          role: "director",
          kind: "blocks_past_booking_deadline",
          text: `${pluralize(late, "reserved block")} past the booking deadline — keep or release`,
        });
      }
    }
  }
  if (roles.length === 0) return items;
  return items.filter((item) => roles.includes(item.role));
}
