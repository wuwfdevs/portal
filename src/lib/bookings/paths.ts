// URL helpers for the Rates screens — pure, shared by the pages and their
// actions so a section's path is written in one place.

export const BOOKINGS_PATH = "/bookings";
export const RATES_PATH = `${BOOKINGS_PATH}/rates`;

export type RatesSection =
  | "assumptions"
  | "labor"
  | "pools"
  | "packages"
  | "card"
  | "assets"
  | "setup"
  | "changes";

export const RATES_SECTIONS: { key: RatesSection; label: string; versioned: boolean }[] = [
  { key: "assumptions", label: "Assumptions", versioned: true },
  { key: "labor", label: "Labor", versioned: true },
  { key: "pools", label: "Resource pools", versioned: true },
  { key: "packages", label: "Service packages", versioned: true },
  { key: "card", label: "Rate card", versioned: true },
  { key: "assets", label: "Assets", versioned: false },
  { key: "setup", label: "Classes and pools", versioned: false },
  { key: "changes", label: "Change log", versioned: false },
];

/**
 * The Rates tab row has three tabs, not one per section (docs/bookings-design.md §23):
 * the output (Rate card), the four editors that feed it (reached from the Inputs
 * checklist), and the change log. Assets and the classes/pools catalogs are kept
 * behind the row's "⋯" menu. `inputs` is a tab and a page of its own; the four editor
 * sections all light it.
 */
export type RatesTab = "card" | "inputs" | "history";

export const INPUT_SECTIONS: readonly RatesSection[] = [
  "assumptions",
  "labor",
  "pools",
  "packages",
];

/** Which of the three tabs a section belongs under; null for the "⋯" menu's catalogs. */
export function ratesTabFor(section: RatesSection | "inputs"): RatesTab | null {
  if (section === "card") return "card";
  if (section === "changes") return "history";
  if (section === "inputs" || (INPUT_SECTIONS as readonly string[]).includes(section))
    return "inputs";
  return null;
}

/** The Rates screen for a section, scoped to a version and carrying any extra query fields. */
export function ratesHref(
  section: RatesSection | "inputs",
  versionId?: string | null,
  extra?: Record<string, string>,
): string {
  const base = `${RATES_PATH}/${section}`;
  const params = new URLSearchParams();
  if (versionId) params.set("version", versionId);
  for (const [key, value] of Object.entries(extra ?? {})) params.set(key, value);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

// The Calendar tab (slice 2) --------------------------------------------------------------------

export const CALENDAR_PATH = `${BOOKINGS_PATH}/calendar`;
export const PLAN_PATH = `${CALENDAR_PATH}/plan`;

/** A path with the given query fields, skipping empty ones. */
export function withQuery(base: string, query: Record<string, string | undefined | null>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const text = params.toString();
  return text ? `${base}?${text}` : base;
}

/** The Calendar screen at a view and date, scoped to a plan, carrying any extra query fields. */
export function calendarHref(query: Record<string, string | undefined | null>): string {
  return withQuery(CALENDAR_PATH, query);
}

// Requests and the project page (slice 3) -----------------------------------------------------

export const REQUESTS_PATH = `${BOOKINGS_PATH}/requests`;

export function requestHref(
  projectId: string,
  query?: Record<string, string | undefined | null>,
): string {
  return withQuery(`${REQUESTS_PATH}/${projectId}`, query ?? {});
}

export function requestEditHref(projectId: string): string {
  return `${REQUESTS_PATH}/${projectId}/edit`;
}

// The intake form's settings (slice 4) — under Requests, per docs/bookings-design.md §4.

export const INTAKE_PATH = `${BOOKINGS_PATH}/intake`;

// Partners and agreements (slice 5) -------------------------------------------------------------------

export const PARTNERS_PATH = `${BOOKINGS_PATH}/partners`;

export function partnerHref(
  partnerId: string,
  query?: Record<string, string | undefined | null>,
): string {
  return withQuery(`${PARTNERS_PATH}/${partnerId}`, query ?? {});
}

export function partnerEditHref(partnerId: string): string {
  return `${PARTNERS_PATH}/${partnerId}/edit`;
}

export function agreementNewHref(partnerId: string): string {
  return `${PARTNERS_PATH}/${partnerId}/agreements/new`;
}

export function agreementHref(
  partnerId: string,
  agreementId: string,
  query?: Record<string, string | undefined | null>,
): string {
  return withQuery(`${PARTNERS_PATH}/${partnerId}/agreements/${agreementId}`, query ?? {});
}

export function agreementEditHref(partnerId: string, agreementId: string): string {
  return `${PARTNERS_PATH}/${partnerId}/agreements/${agreementId}/edit`;
}
