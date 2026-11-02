"use client";

import { RouteError } from "@/components/ui/route-error";

/**
 * Catches read failures thrown by lib/remote-interview/sessions.ts. A broken
 * query says so, out loud, instead of rendering as an empty session list —
 * see CLAUDE.md on why a swallowed Supabase error is a bug, not a fallback.
 */
export default function RemoteInterviewError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <RouteError toolName="Remote Interview" error={error} reset={reset} />
    </div>
  );
}
