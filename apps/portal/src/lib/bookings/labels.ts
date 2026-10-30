// Display labels for Bookings' enums — pure, shared by the Rates screens.
import type {
  BkAssetBurden,
  BkAssetCondition,
  BkAssetFunding,
  BkAssumptionOwner,
  BkBookingStatus,
  BkHoldKind,
  BkPayBasis,
  BkPoolCosting,
  BkPricingTreatment,
  BkTermPlanStatus,
  BkValidationState,
  BkVersionStatus,
} from "@/lib/database.types";
import { formatDollars, formatShare } from "./rates";

export const VERSION_STATUS_LABEL: Record<BkVersionStatus, string> = {
  draft: "Draft",
  submitted: "Submitted to UWF Budget / Controller",
  adopted: "Adopted",
  superseded: "Superseded",
};

export const VALIDATION_STATE_LABEL: Record<BkValidationState, string> = {
  pending: "Awaiting validation",
  validated: "Validated",
  accepted_as_is: "Accepted as is",
};

export const OWNER_LABEL: Record<BkAssumptionOwner, string> = {
  finance: "Finance",
  director: "Director",
  executive: "Executive",
};

export const ASSET_FUNDING_LABEL: Record<BkAssetFunding, string> = {
  station: "Station",
  foundation_gift: "Foundation / gift",
  grant_restricted: "Grant, restricted",
  uwf: "UWF",
};

export const ASSET_BURDEN_LABEL: Record<BkAssetBurden, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const ASSET_CONDITION_LABEL: Record<BkAssetCondition, string> = {
  good: "Good",
  fair: "Fair",
  worn: "Worn",
  out_of_service: "Out of service",
};

/** A unit that names a share ("of salary", "of revenue") prints its value as a percentage. */
export function isShareUnit(unit: string): boolean {
  return /^of\b/i.test(unit.trim());
}

/** A unit that names money ("per year", "per hour") prints its value as dollars. */
export function isMoneyUnit(unit: string): boolean {
  return /^per\b/i.test(unit.trim());
}

/** An assumption's value as the Assumptions table shows it. */
export function formatAssumptionValue(value: number, unit: string): string {
  if (isShareUnit(unit)) return formatShare(value);
  if (isMoneyUnit(unit)) return formatDollars(value, { cents: !Number.isInteger(value) });
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

/** A quantity such as 1.5 units or 0.5 half-days, without trailing zeros. */
export function formatQuantity(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

// Slice 2 — the term plan and the calendar.

export const TERM_PLAN_STATUS_LABEL: Record<BkTermPlanStatus, string> = {
  draft: "Draft",
  active: "Active",
  closed: "Closed",
};

export const HOLD_KIND_LABEL: Record<BkHoldKind, string> = {
  core: "Core WUWF work",
  maintenance: "Maintenance",
};

export const BOOKING_STATUS_LABEL: Record<BkBookingStatus, string> = {
  planned: "Planned",
  tentative: "Tentative",
  confirmed: "Confirmed",
  released: "Released",
};

export const TREATMENT_LABEL: Record<BkPricingTreatment, string> = {
  strategic: "Strategic (baseline envelope)",
  incremental: "Incremental internal",
  external: "External",
};

export const TREATMENT_SHORT_LABEL: Record<BkPricingTreatment, string> = {
  strategic: "Strategic",
  incremental: "Incremental",
  external: "External",
};

// Slice 2b — labor classes and pools as data.

export const PAY_BASIS_LABEL: Record<BkPayBasis, string> = {
  salaried: "Salaried (salary ÷ paid hours)",
  hourly: "Hourly (wage)",
};

export const POOL_COSTING_LABEL: Record<BkPoolCosting, string> = {
  allocated: "A share of the shared production pool",
  own_lines: "Its own budget lines",
};

// Refinement pass, slice A (docs/bookings-design.md §18.4) — what production staff read.
// The internal names (strategic, incremental, external) stay on the Rates tab, in
// Finance views and in the "Show calculation" panel.

export const PRODUCTION_RATE_LABEL: Record<BkPricingTreatment, string> = {
  strategic: "University rate (WUWF contributing)",
  incremental: "University rate",
  external: "Outside rate",
};

/** One short sentence on what the rate means, for the hint under a price. */
export const PRODUCTION_RATE_HINT: Record<BkPricingTreatment, string> = {
  strategic:
    "The partner pays for student crew, equipment and direct costs; WUWF contributes the staff time.",
  incremental: "The partner pays the full cost of the work, staff time included.",
  external: "An outside organization pays the full cost plus the university's fee and WUWF's margin.",
};
