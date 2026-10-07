"use client";

import { RouteError } from "@/components/ui/route-error";

/**
 * Catches read failures thrown by lib/bookings/queries.ts. A broken query
 * says so, out loud, instead of rendering as an empty rate model — see
 * CLAUDE.md on why a swallowed Supabase error is a bug, not a fallback.
 */
export default function BookingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError toolName="Bookings" error={error} reset={reset} />;
}
