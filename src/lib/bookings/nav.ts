// Which tabs a viewer sees — pure. docs/bookings-design.md §18.6. Production
// staff estimate and book; they don't need the rate model or the term plan
// every day, so those sit under "More". A member with no role still reads
// everything (§6.1), so nothing is removed — it is one click further.

import type { BookingsRole } from "./roles";

export interface BookingsTab {
  href: string;
  label: string;
  exact: boolean;
}

const DASHBOARD: BookingsTab = { href: "/bookings", label: "Dashboard", exact: true };
const REQUESTS: BookingsTab = { href: "/bookings/requests", label: "Requests", exact: false };
const CALENDAR: BookingsTab = { href: "/bookings/calendar", label: "Calendar", exact: false };
const PARTNERS: BookingsTab = { href: "/bookings/partners", label: "Partners", exact: false };
const RATES: BookingsTab = { href: "/bookings/rates", label: "Rates", exact: false };

/** The model-facing roles: whoever maintains the rates or the term plan. */
export function isModelRole(roles: readonly BookingsRole[]): boolean {
  return roles.some((role) => role === "finance" || role === "director" || role === "executive");
}

export function visibleTabs(
  roles: readonly BookingsRole[],
  isAdministrator = false,
): { primary: BookingsTab[]; more: BookingsTab[] } {
  const base = [DASHBOARD, REQUESTS, CALENDAR, PARTNERS];
  if (isAdministrator || isModelRole(roles)) return { primary: [...base, RATES], more: [] };
  return { primary: base, more: [RATES] };
}

/** Whether the term plan link on the Calendar sits inline (the director, the executive) or under More. */
export function termPlanInline(roles: readonly BookingsRole[], isAdministrator = false): boolean {
  return isAdministrator || roles.includes("director") || roles.includes("executive");
}
