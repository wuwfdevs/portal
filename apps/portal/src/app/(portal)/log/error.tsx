"use client";

import { RouteError } from "@/components/ui/route-error";

/**
 * Catches read failures thrown by lib/log/queries.ts. A broken query says so,
 * out loud, instead of rendering as an empty schedule — see CLAUDE.md on why
 * a swallowed Supabase error is a bug, not a fallback.
 */
export default function LogError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError toolName="On Air" error={error} reset={reset} />;
}
