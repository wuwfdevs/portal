// Pure logic for the public request form at /book and its settings screen
// (docs/bookings-design.md §2.4, §6.3): the wizard's steps, the client-side
// validation that gives a visitor a sentence before a round trip, the payload
// bk_submit_request() receives, the sentence for each error code it can
// return, and the offered-packages list the settings form edits. No Supabase,
// no React. bk_submit_request() re-checks everything here in one transaction;
// this is the courtesy layer, the function is the boundary.

import { isValidDateISO } from "@/lib/dates";
import { isValidEmail } from "@/lib/validation";
import type { BkPartnerKind, BkRequested } from "@/lib/database.types";

export const INTAKE_TITLE_MAX = 160;
export const INTAKE_PARTNER_MAX = 160;
export const INTAKE_LOCATION_MAX = 200;
/** A form submitted faster than this was not filled in by a person. */
export const MIN_SUBMIT_ELAPSED_MS = 3000;

export const REQUESTED_OPTIONS: { value: BkRequested; label: string; description: string }[] = [
  {
    value: "production",
    label: "Production",
    description:
      "A webcast, a studio or field recording, or editing — WUWF's people and equipment.",
  },
  {
    value: "airtime",
    label: "Airtime",
    description:
      "A university message or feature on the air — a live read, a recorded spot, a recurring segment.",
  },
  { value: "both", label: "Both", description: "Produce something and air it." },
];

export const PARTNER_KIND_OPTIONS: { value: BkPartnerKind; label: string }[] = [
  { value: "uwf_unit", label: "A UWF college, department, office or program" },
  { value: "external", label: "An organization outside the university" },
];

export const AIRTIME_LENGTH_OPTIONS: { value: number; label: string }[] = [
  { value: 15, label: "15 seconds" },
  { value: 30, label: "30 seconds" },
  { value: 60, label: "60 seconds" },
  { value: 120, label: "Two minutes" },
  { value: 300, label: "Five minutes or longer" },
];

// The wizard ---------------------------------------------------------------------------------------------

export type IntakeStepId = "about" | "ask" | "when" | "airtime" | "wrapup";

export const INTAKE_STEP_TITLE: Record<IntakeStepId, string> = {
  about: "About you",
  ask: "What you need",
  when: "When and where",
  airtime: "The airtime",
  wrapup: "Anything else",
};

/** True when the request asks for airtime (alone or with production). */
export function intakeAsksForAirtime(requested: string): boolean {
  return requested === "airtime" || requested === "both";
}

/** True when the request asks for production (alone or with airtime). */
export function intakeAsksForProduction(requested: string): boolean {
  return requested === "production" || requested === "both";
}

/** The steps the form shows for what is asked; the airtime step only when airtime is. */
export function visibleIntakeSteps(requested: string): IntakeStepId[] {
  const steps: IntakeStepId[] = ["about", "ask", "when"];
  if (intakeAsksForAirtime(requested)) steps.push("airtime");
  steps.push("wrapup");
  return steps;
}

// Validation ---------------------------------------------------------------------------------------------

export interface IntakeInput {
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  partnerName: string;
  partnerKind: string;
  title: string;
  description: string;
  requested: string;
  packages: string[];
  /** What the form offered — a submitted name outside it is refused. */
  offeredPackages: string[];
  eventStartsOn: string;
  eventEndsOn: string;
  deliverablesDueOn: string;
  location: string;
  airingsPerWeek: string;
  seconds: string;
  airtimeStartsOn: string;
  airtimeEndsOn: string;
  honeypot: string;
  renderedAtMs: number;
  nowMs: number;
}

const INTEGER = /^\d+$/;

/** True when the honeypot was filled — the caller silently accepts and drops. */
export function isHoneypotTripped(honeypot: string): boolean {
  return honeypot.trim() !== "";
}

/**
 * Null when valid; otherwise the first problem, as a sentence for the visitor.
 * A tripped honeypot is null too — never say why (the caller treats it as a
 * successful submit and writes nothing).
 */
export function validateIntakeInput(input: IntakeInput): string | null {
  if (isHoneypotTripped(input.honeypot)) return null;
  if (input.nowMs - input.renderedAtMs < MIN_SUBMIT_ELAPSED_MS) {
    return "That went a little too fast — please try again.";
  }
  if (input.contactName.trim() === "") return "Enter your name.";
  if (!isValidEmail(input.contactEmail)) return "Enter a valid email address.";
  if (input.partnerName.trim() === "")
    return "Name your college, department, office or organization.";
  if (input.partnerName.trim().length > INTAKE_PARTNER_MAX) {
    return `Keep the organization's name under ${INTAKE_PARTNER_MAX} characters.`;
  }
  if (!PARTNER_KIND_OPTIONS.some((option) => option.value === input.partnerKind)) {
    return "Say whether you are part of UWF or an outside organization.";
  }
  if (!REQUESTED_OPTIONS.some((option) => option.value === input.requested)) {
    return "Choose production, airtime, or both.";
  }
  if (input.title.trim() === "") return "Give the request a short title.";
  if (input.title.trim().length > INTAKE_TITLE_MAX) {
    return `Keep the title under ${INTAKE_TITLE_MAX} characters.`;
  }
  if (input.description.trim() === "") return "Describe what you need.";
  if (intakeAsksForProduction(input.requested)) {
    const offered = new Set(input.offeredPackages.map((name) => name.trim()));
    if (input.packages.some((name) => !offered.has(name.trim()))) {
      return "Choose from the listed services.";
    }
  }
  if (input.location.trim().length > INTAKE_LOCATION_MAX) {
    return `Keep the location under ${INTAKE_LOCATION_MAX} characters.`;
  }
  for (const [value, label] of [
    [input.eventStartsOn, "The first event date"],
    [input.eventEndsOn, "The last event date"],
    [input.deliverablesDueOn, "The date you need it by"],
    [input.airtimeStartsOn, "The first airing date"],
    [input.airtimeEndsOn, "The last airing date"],
  ] as const) {
    if (value.trim() !== "" && !isValidDateISO(value.trim())) return `${label} must be a date.`;
  }
  if (input.eventStartsOn && input.eventEndsOn && input.eventEndsOn < input.eventStartsOn) {
    return "The event must end on or after the day it starts.";
  }
  if (intakeAsksForAirtime(input.requested)) {
    const airings = input.airingsPerWeek.trim();
    if (airings !== "" && (!INTEGER.test(airings) || Number(airings) < 1 || Number(airings) > 99)) {
      return "Airings a week must be a whole number from 1 to 99.";
    }
    const seconds = input.seconds.trim();
    if (
      seconds !== "" &&
      (!INTEGER.test(seconds) || Number(seconds) < 1 || Number(seconds) > 3600)
    ) {
      return "Choose a length for each airing.";
    }
    if (
      input.airtimeStartsOn &&
      input.airtimeEndsOn &&
      input.airtimeEndsOn < input.airtimeStartsOn
    ) {
      return "The airtime must end on or after the day it starts.";
    }
  }
  return null;
}

// The payload --------------------------------------------------------------------------------------------

/** Exactly what bk_submit_request(p_payload) reads. Every value trimmed; fields for a track not asked for are dropped. */
export type IntakePayload = {
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  partner_name: string;
  partner_kind: string;
  title: string;
  description: string;
  requested: string;
  packages: string[];
  event_starts_on: string;
  event_ends_on: string;
  deliverables_due_on: string;
  location: string;
  airings_per_week: string;
  seconds: string;
  airtime_starts_on: string;
  airtime_ends_on: string;
};

export function buildIntakePayload(input: IntakeInput): IntakePayload {
  const airtime = intakeAsksForAirtime(input.requested);
  const production = intakeAsksForProduction(input.requested);
  return {
    contact_name: input.contactName.trim(),
    contact_email: input.contactEmail.trim(),
    contact_phone: input.contactPhone.trim(),
    partner_name: input.partnerName.trim(),
    partner_kind: input.partnerKind.trim(),
    title: input.title.trim(),
    description: input.description.trim(),
    requested: input.requested.trim(),
    packages: production
      ? [...new Set(input.packages.map((name) => name.trim()).filter(Boolean))]
      : [],
    event_starts_on: input.eventStartsOn.trim(),
    event_ends_on: input.eventEndsOn.trim(),
    deliverables_due_on: input.deliverablesDueOn.trim(),
    location: input.location.trim(),
    airings_per_week: airtime ? input.airingsPerWeek.trim() : "",
    seconds: airtime ? input.seconds.trim() : "",
    airtime_starts_on: airtime ? input.airtimeStartsOn.trim() : "",
    airtime_ends_on: airtime ? input.airtimeEndsOn.trim() : "",
  };
}

// Error codes --------------------------------------------------------------------------------------------

const GENERIC_ERROR = "Something went wrong sending your request. Please try again.";

/** The sentence for each error code bk_submit_request() can return. */
export const INTAKE_ERROR_MESSAGES: Record<string, string> = {
  closed: "WUWF is not taking new production requests right now.",
  invalid_email: "Enter a valid email address.",
  missing_required_field: "Fill in the required fields before sending.",
  too_long: "One of the answers is too long.",
  invalid_partner_kind: "Say whether you are part of UWF or an outside organization.",
  invalid_requested: "Choose production, airtime, or both.",
  invalid_package: "Choose from the listed services.",
  invalid_date: "One of the dates isn't a date, or the end comes before the start.",
  invalid_airtime: "Check the airings a week and the length of each airing.",
  rate_limited:
    "A number of requests have come from you recently — please wait a bit and try again.",
};

export function intakeErrorMessage(code: string | null | undefined): string {
  return (code && INTAKE_ERROR_MESSAGES[code]) || GENERIC_ERROR;
}

// Settings -----------------------------------------------------------------------------------------------

export const OFFERED_PACKAGE_MAX = 60;
export const OFFERED_PACKAGES_LIMIT = 20;

/**
 * The offered-packages list from the settings form's textarea, one name a
 * line: trimmed, blanks dropped, duplicates (case-insensitively) dropped.
 * Returns the names, or the first problem.
 */
export function parseOfferedPackages(
  text: string,
): { ok: true; names: string[] } | { ok: false; error: string } {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const name = raw.trim();
    if (name === "") continue;
    if (name.length > OFFERED_PACKAGE_MAX) {
      return {
        ok: false,
        error: `Keep each service name under ${OFFERED_PACKAGE_MAX} characters.`,
      };
    }
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  if (names.length > OFFERED_PACKAGES_LIMIT) {
    return { ok: false, error: `Offer at most ${OFFERED_PACKAGES_LIMIT} services on the form.` };
  }
  return { ok: true, names };
}
