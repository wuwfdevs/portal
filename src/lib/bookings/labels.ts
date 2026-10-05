// Display labels for Bookings' enums — pure, shared by the Rates screens.
import type {
  BkAssetBurden,
  BkAssetCondition,
  BkAssetFunding,
  BkAssumptionOwner,
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
