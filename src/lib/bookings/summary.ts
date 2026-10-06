// The project page's one summary line — pure, no Supabase, no React.
// docs/bookings-design.md §18.3. The answer first: what, how much work, what
// the partner pays, whether the capacity is there, what WUWF contributes, and
// where the estimate stands. The machinery (cost build-up, the pricing reason,
// the version, the provisional note) sits behind "Show calculation".

import type { BkPricingTreatment } from "@/lib/database.types";
import { PRODUCTION_RATE_LABEL } from "./labels";
import type { EstimateState } from "./projects";
import { roundCents, formatDollars } from "./rates";
import type { HoursByClass } from "./scheduling";

export interface SummaryLine {
  label: string;
  quantity: number;
  unit_label: string;
  kind: "package" | "labor" | "expense";
  /** Per unit of the line. */
  labor_hours: HoursByClass;
}

export interface ClassFlag {
  id: string;
  charged_in_strategic: boolean;
}

/** Hours in the two buckets production staff think in: staff, and students. */
export function hourBuckets(
  lines: readonly Pick<SummaryLine, "quantity" | "labor_hours">[],
  classes: readonly ClassFlag[],
): { staff: number; student: number } {
  let staff = 0;
  let student = 0;
  for (const line of lines) {
    for (const [classId, perUnit] of Object.entries(line.labor_hours)) {
      const hours = Number(perUnit) * Number(line.quantity);
      if (hours <= 0) continue;
      const cls = classes.find((c) => c.id === classId);
      if (cls && !cls.charged_in_strategic) staff += hours;
      else student += hours;
    }
  }
  return { staff: roundCents(staff), student: roundCents(student) };
}

export type CapacityStatus =
  | { kind: "none_needed" }
  | { kind: "no_term" }
  | { kind: "no_date" }
  | { kind: "unplanned" }
  | { kind: "available"; warnings: number }
  | { kind: "attention" }
  | { kind: "held"; until: string }
  | { kind: "confirmed" };

export function capacityPhrase(status: CapacityStatus): string | null {
  switch (status.kind) {
    case "none_needed":
      return null;
    case "no_term":
      return "No term plan is active";
    case "no_date":
      return "Pick a date to check capacity";
    case "unplanned":
      return "Dates not planned yet";
    case "available":
      return status.warnings > 0 ? "Capacity available (see the check)" : "Capacity available";
    case "attention":
      return "Date needs attention";
    case "held":
      return `Dates held until ${status.until}`;
    case "confirmed":
      return "Dates confirmed";
  }
}

/** The capacity status the summary line reads, from facts the page already has. */
export function capacityStatusFor(facts: {
  /** The request needs dates: production asked for, with something to hold. */
  needsDates: boolean;
  hasTerm: boolean;
  eventDate: string | null;
  /** Dates that are not released. */
  openBookings: number;
  /** The system's plan is an exception. */
  planFailed: boolean;
  /** Hand-planned dates the rule would refuse today. */
  failingDates: number;
  warnings: number;
  estimate: EstimateState;
  /** The estimate's hold expiry, already formatted, when it is out. */
  heldUntil: string | null;
}): CapacityStatus {
  if (!facts.needsDates) return { kind: "none_needed" };
  if (!facts.hasTerm) return { kind: "no_term" };
  if (facts.estimate.kind === "approved") return { kind: "confirmed" };
  if (facts.estimate.kind === "sent" && facts.heldUntil) {
    return { kind: "held", until: facts.heldUntil };
  }
  if (facts.planFailed || facts.failingDates > 0) return { kind: "attention" };
  if (facts.openBookings > 0) return { kind: "available", warnings: facts.warnings };
  return facts.eventDate ? { kind: "unplanned" } : { kind: "no_date" };
}

function pluralize(count: number, noun: string): string {
  const text = Number.isInteger(count) ? String(count) : String(roundCents(count));
  return `${text} ${noun}${count === 1 ? "" : "s"}`;
}

export function hoursPhrase(hours: { staff: number; student: number }): string | null {
  const parts: string[] = [];
  if (hours.staff > 0) parts.push(pluralize(hours.staff, "staff hour"));
  if (hours.student > 0) parts.push(pluralize(hours.student, "student hour"));
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * WUWF's contribution in words. With the figure (Slice B) it names dollars and,
 * for a university rate with WUWF contributing, the staff hours behind them;
 * before it, only the hours.
 */
export function contributionPhrase(input: {
  treatment: BkPricingTreatment;
  staffHours: number;
  contribution: number | null;
}): string {
  const { treatment, staffHours, contribution } = input;
  if (treatment === "external") return "No WUWF contribution";
  if (contribution !== null) {
    if (contribution <= 0) return "No WUWF contribution — the partner covers the full cost";
    const hours = staffHours > 0 && treatment === "strategic" ? ` (${pluralize(staffHours, "staff hour")})` : "";
    return `WUWF contributes ${formatDollars(contribution)}${hours}`;
  }
  if (treatment === "strategic" && staffHours > 0) {
    return `WUWF contributes ${pluralize(staffHours, "staff hour")}`;
  }
  return "No WUWF contribution";
}

export function estimatePhrase(state: EstimateState, readyToSend: boolean): string {
  switch (state.kind) {
    case "none":
      return readyToSend ? "Ready to send" : "Not ready to send";
    case "sent":
      return `Estimate expires in ${state.daysLeft} day${state.daysLeft === 1 ? "" : "s"}`;
    case "expired":
      return "Estimate expired";
    case "approved":
      return "Estimate approved";
  }
}

export interface SummaryInput {
  /** Package line names, quantity-aware: "Basic event webcast" or "2 × Studio access (half-day)". */
  services: string[];
  hours: { staff: number; student: number };
  priced: boolean;
  total: number;
  treatment: BkPricingTreatment | null;
  capacity: CapacityStatus;
  /** Slice B's figure; null before it is stored. */
  contribution: number | null;
  estimate: EstimateState;
  readyToSend: boolean;
}

export interface SummaryPart {
  key: "services" | "hours" | "price" | "capacity" | "contribution" | "estimate";
  text: string;
}

export function buildSummary(input: SummaryInput): { parts: SummaryPart[]; text: string } {
  const parts: SummaryPart[] = [];
  if (input.services.length > 0) {
    parts.push({ key: "services", text: input.services.join(" + ") });
  }
  const hours = hoursPhrase(input.hours);
  if (hours) parts.push({ key: "hours", text: hours });
  if (input.priced && input.treatment) {
    parts.push({
      key: "price",
      text: `${formatDollars(input.total)} · ${PRODUCTION_RATE_LABEL[input.treatment]}`,
    });
  } else {
    parts.push({ key: "price", text: "Not priced yet" });
  }
  const capacity = capacityPhrase(input.capacity);
  if (capacity) parts.push({ key: "capacity", text: capacity });
  if (input.priced && input.treatment) {
    parts.push({
      key: "contribution",
      text: contributionPhrase({
        treatment: input.treatment,
        staffHours: input.hours.staff,
        contribution: input.contribution,
      }),
    });
  }
  parts.push({ key: "estimate", text: estimatePhrase(input.estimate, input.readyToSend) });
  return { parts, text: parts.map((p) => p.text).join(" · ") };
}

/** A package line's name as the summary names it. */
export function serviceName(line: Pick<SummaryLine, "label" | "quantity">): string {
  const quantity = Number(line.quantity);
  return quantity === 1 ? line.label : `${Number.isInteger(quantity) ? quantity : roundCents(quantity)} × ${line.label}`;
}
