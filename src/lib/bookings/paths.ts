// URL helpers for the Rates screens — pure, shared by the pages and their
// actions so a section's path is written in one place.

export const BOOKINGS_PATH = "/bookings";
export const RATES_PATH = `${BOOKINGS_PATH}/rates`;

export type RatesSection = "assumptions" | "pools" | "packages" | "card" | "assets" | "changes";

export const RATES_SECTIONS: { key: RatesSection; label: string; versioned: boolean }[] = [
  { key: "assumptions", label: "Assumptions", versioned: true },
  { key: "pools", label: "Resource pools", versioned: true },
  { key: "packages", label: "Service packages", versioned: true },
  { key: "card", label: "Rate card", versioned: true },
  { key: "assets", label: "Assets", versioned: false },
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
