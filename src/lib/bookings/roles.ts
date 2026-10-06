// Pure role logic for Bookings (key `bookings`), factored out of access.ts so
// it's testable without "server-only" / Supabase. See
// docs/bookings-design.md §3.
//
// Bookings is invite_only: a tool_access grant is the ticket in, and a grant
// with no role reads everything. Roles stack — a grant carries a list
// (tool_access.tool_roles), the shape docs/broadcast-roles.md established:
//   * production — anyone on the production staff: estimates, books, confirms
//                 hours, marks delivered (private.is_bookings_production()).
//                 Named for the function, not the one position that holds it
//                 today (slice 2b);
//   * director  — the Director of Operations: term plan, holds and blackouts,
//                 resource units, assets, reserved blocks
//                 (private.is_bookings_director());
//   * finance   — assumptions and their validation, rate model versions,
//                 settlements (private.is_bookings_finance());
//   * executive — adopts a rate card version, approves agreements, records a
//                 booking-rule exception (private.is_bookings_executive()).
// The SQL predicates are the boundary; this only shapes the screens.

export type BookingsRole = "production" | "director" | "finance" | "executive";

const KNOWN: readonly BookingsRole[] = ["production", "director", "finance", "executive"];

/** The roles a grant carries, in a stable order. */
export function parseBookingsRoles(
  toolRoles: readonly string[] | null | undefined,
): BookingsRole[] {
  const found = new Set((toolRoles ?? []).map((role) => role.trim().toLowerCase()));
  return KNOWN.filter((role) => found.has(role));
}

/** What each role means, for the admin grant screen's checkboxes. */
export const ROLE_OPTIONS: { value: BookingsRole; label: string; description: string }[] = [
  {
    value: "production",
    label: "Production staff",
    description: "Estimates and books partner work, confirms hours, marks projects delivered",
  },
  {
    value: "director",
    label: "Director of Operations",
    description:
      "Keeps the term plan, holds and blackouts, resource units, and the asset inventory",
  },
  {
    value: "finance",
    label: "Finance",
    description: "Maintains and validates the rate model's assumptions, and posts settlements",
  },
  {
    value: "executive",
    label: "Executive Director",
    description: "Adopts a rate card version, approves agreements, and records booking exceptions",
  },
];
