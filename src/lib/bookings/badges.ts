// The warning badges for an unusual project — pure. docs/bookings-design.md
// §18.7. The routine case shows none. Each badge is derived from a fact already
// on the project or its dates, so the list page and the project page agree.

import type { BadgeVariant } from "@/components/ui/badge";

export type ProjectBadgeKey =
  | "pricing_changed"
  | "booking_exception"
  | "reserve_depleted"
  | "dates_need_attention"
  | "above_market"
  | "scope_adjusted"
  | "custom_package";

export const BADGE_LABEL: Record<ProjectBadgeKey, string> = {
  pricing_changed: "Pricing changed by hand",
  booking_exception: "Booking exception",
  reserve_depleted: "WUWF contribution time used up",
  dates_need_attention: "Dates need attention",
  above_market: "Above market",
  scope_adjusted: "Adjusted scope",
  custom_package: "Custom package",
};

export const BADGE_TITLE: Record<ProjectBadgeKey, string> = {
  pricing_changed: "The rate was set by hand rather than derived from the facts on the request.",
  booking_exception:
    "A date was booked past the booking rule on the Executive Director's exception.",
  reserve_depleted:
    "The work qualifies as strategic, but the time WUWF sets aside for it is used up, so it is priced at the university rate.",
  dates_need_attention:
    "The dates couldn't be planned automatically; pick one of the alternatives or plan them by hand.",
  above_market:
    "A rate on this estimate is above the package's market ceiling. Review the scope or the model; the price is not capped.",
  scope_adjusted: "A package's hours, units or crew were adjusted for this project.",
  custom_package: "A package scoped to an agreement is on this estimate.",
};

export interface ProjectBadgeFacts {
  pricingOverridden: boolean;
  bookingException: boolean;
  reserveDepleted: boolean;
  datesNeedAttention: boolean;
  aboveMarket: boolean;
  scopeAdjusted: boolean;
  customPackage: boolean;
}

export const NO_BADGE_FACTS: ProjectBadgeFacts = {
  pricingOverridden: false,
  bookingException: false,
  reserveDepleted: false,
  datesNeedAttention: false,
  aboveMarket: false,
  scopeAdjusted: false,
  customPackage: false,
};

export function badgesFor(facts: ProjectBadgeFacts): ProjectBadgeKey[] {
  const keys: ProjectBadgeKey[] = [];
  if (facts.pricingOverridden) keys.push("pricing_changed");
  if (facts.bookingException) keys.push("booking_exception");
  if (facts.reserveDepleted) keys.push("reserve_depleted");
  if (facts.datesNeedAttention) keys.push("dates_need_attention");
  if (facts.aboveMarket) keys.push("above_market");
  if (facts.scopeAdjusted) keys.push("scope_adjusted");
  if (facts.customPackage) keys.push("custom_package");
  return keys;
}

export const BADGE_VARIANT: BadgeVariant = "warning";

/**
 * The dates need attention when the project is a production request in the
 * system's hands that has a package and an event date but no dates — the plan
 * wrote nothing because it was an exception (bookings are always written when
 * the plan passes). Nothing is stored for it: it is read from the facts.
 */
export function datesNeedAttention(facts: {
  asksForProduction: boolean;
  disposition: string | null;
  stage: string;
  datesMode: string;
  hasPackageLine: boolean;
  eventStartsOn: string | null;
  openBookings: number;
}): boolean {
  return (
    facts.asksForProduction &&
    facts.disposition === null &&
    facts.stage === "request" &&
    facts.datesMode === "auto" &&
    facts.hasPackageLine &&
    facts.eventStartsOn !== null &&
    facts.openBookings === 0
  );
}

export interface ProjectBadgeSource {
  requested: string;
  disposition: string | null;
  stage: string;
  dates_mode: string;
  event_starts_on: string | null;
  pricing_overridden_by: string | null;
  qualifies_strategic: boolean | null;
  reserve_depleted: boolean;
  /** The benchmark snapshot stored when priced (§19.1): a rate above its ceiling is "above market". */
  market_benchmarks?: readonly { rate: number; ceiling: number | null }[];
}

export interface ProjectDateFacts {
  hasPackageLine: boolean;
  /** Dates that are not released: planned, held or confirmed. */
  openBookings: number;
  /** A date booked past the rule on an exception reason. */
  bookingException: boolean;
  /** Hand-planned dates the rule would refuse today (the project page checks them). */
  failingPlannedDates?: number;
  /** A package line's hours, units or crew were adjusted on this project (§20.6). */
  scopeAdjusted?: boolean;
  /** A package scoped to an agreement is on the estimate. */
  customPackage?: boolean;
}

/**
 * The badge facts for one project, from its row and what its dates and lines
 * say — one function so the Requests list and the project page agree. The
 * estimate-level facts (above market, scope adjusted, custom package) come in through
 * `dates` and the stored benchmark snapshot.
 */
export function projectBadgeFacts(
  project: ProjectBadgeSource,
  dates: ProjectDateFacts,
): ProjectBadgeFacts {
  return {
    pricingOverridden: project.pricing_overridden_by !== null,
    bookingException: dates.bookingException,
    // The judgment stays "qualifies"; the badge is the system's finding that the time ran out.
    reserveDepleted: project.reserve_depleted && project.qualifies_strategic !== false,
    datesNeedAttention:
      datesNeedAttention({
        asksForProduction: project.requested !== "airtime",
        disposition: project.disposition,
        stage: project.stage,
        datesMode: project.dates_mode,
        hasPackageLine: dates.hasPackageLine,
        eventStartsOn: project.event_starts_on,
        openBookings: dates.openBookings,
      }) || (dates.failingPlannedDates ?? 0) > 0,
    aboveMarket: (project.market_benchmarks ?? []).some(
      (b) => b.ceiling !== null && Number(b.rate) > Number(b.ceiling),
    ),
    scopeAdjusted: dates.scopeAdjusted ?? false,
    customPackage: dates.customPackage ?? false,
  };
}
