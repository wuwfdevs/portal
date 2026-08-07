"use client";

import { Button } from "@/components/ui/button";

/**
 * Catches read failures thrown by lib/underwriting/queries.ts. A broken
 * query says so, out loud, instead of rendering as an empty contract list —
 * see CLAUDE.md on why a swallowed Supabase error is a bug, not a fallback.
 */
export default function UnderwritingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-xl rounded border border-danger/30 bg-danger/[0.04] p-6">
      <h2 className="font-serif text-[17px] font-bold text-ink-900">Underwriting couldn&apos;t load</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-700">
        Something went wrong reading from the database. This is a problem with the tool, not with
        anything you did.
      </p>
      <p className="mt-3 break-words rounded border border-line bg-white px-3 py-2 font-mono text-xs text-ink-500">
        {error.message}
        {error.digest && <span className="block text-ink-400">Reference: {error.digest}</span>}
      </p>
      <div className="mt-4">
        <Button type="button" onClick={reset} variant="secondary">
          Try again
        </Button>
      </div>
    </div>
  );
}
