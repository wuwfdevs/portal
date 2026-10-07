"use client";

import { RouteError } from "@/components/ui/route-error";

/**
 * Catches read failures thrown by lib/resources/queries.ts, so a broken query
 * says so instead of rendering as an empty library.
 */
export default function ResourcesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError toolName="Resources" error={error} reset={reset} />;
}
