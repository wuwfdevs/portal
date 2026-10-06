// URL helpers for the Rates screens — pure, shared by the pages and their
// actions so a section's path is written in one place.

export const BOOKINGS_PATH = "/bookings";
export const RATES_PATH = `${BOOKINGS_PATH}/rates`;

export type RatesSection =
  "assumptions" | "labor" | "pools" | "packages" | "card" | "assets" | "setup" | "changes";

export const RATES_SECTIONS: { key: RatesSection; label: string; versioned: boolean }[] = [
  { key: "assumptions", label: "Assumptions", versioned: true },
  { key: "labor", label: "Labor", versioned: true },
  { key: "pools", label: "Resource pools", versioned: true },
  { key: "packages", label: "Service packages", versioned: true },
  { key: "card", label: "Rate card", versioned: true },
  { key: "assets", label: "Assets", versioned: false },
  { key: "setup", label: "Setup", versioned: false },
  { key: "changes", label: "Change log", versioned: false },
];

/** The Rates screen for a section, scoped to a version and carrying any extra query fields. */
export function ratesHref(
  section: RatesSection,
  versionId?: string | null,
  extra?: Record<string, string>,
): string {
  const base = section === "assumptions" ? RATES_PATH : `${RATES_PATH}/${section}`;
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
