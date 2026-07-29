"use client";

import { Button } from "@/components/ui/button";
import { GuestShell } from "./guest-shell";

/**
 * Catches read failures thrown by getBoundParticipant() once a guest is
 * authenticated (see that function's comment — a pre-bind lookup returning
 * no rows is expected and never reaches here). A broken query says so out
 * loud rather than rendering as "this link isn't valid" — see CLAUDE.md on
 * why a swallowed Supabase error is a bug, not a fallback.
 */
export default function JoinError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <GuestShell>
      <h2 className="font-serif text-[17px] font-bold text-ink-900">Something went wrong</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-700">
        This is a problem with the tool, not with anything you did.
      </p>
      <p className="mt-3 break-words rounded border border-line bg-panel-50 px-3 py-2 font-mono text-xs text-ink-500">
        {error.message}
        {error.digest && <span className="block text-ink-400">Reference: {error.digest}</span>}
      </p>
      <div className="mt-4">
        <Button type="button" onClick={reset} variant="secondary">
          Try again
        </Button>
      </div>
    </GuestShell>
  );
}
