"use client";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PublicShell } from "@/components/ui/public-shell";

/**
 * A genuine failure loading the form says so out loud rather than rendering
 * as "this form isn't available" — a swallowed Supabase error is a bug, not a
 * fallback (CLAUDE.md). Mirrors src/app/partner/error.tsx.
 */
export default function BookError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PublicShell embedded={false}>
      <PageHeader size="public" title="Something went wrong" />
      <p className="mt-2 text-[15px] leading-relaxed text-ink-700">
        This is a problem on WUWF&apos;s side, not with anything you did.
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
    </PublicShell>
  );
}
