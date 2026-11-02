"use client";

import { RouteError } from "@/components/ui/route-error";

/**
 * Catches read failures thrown by lib/editorial/data.ts. The point is that a
 * broken query says so, out loud, instead of rendering as an empty backlog or
 * an empty settings table.
 */
export default function EditorialError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError toolName="Editorial Planning" error={error} reset={reset} />;
}
