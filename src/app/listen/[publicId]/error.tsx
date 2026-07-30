"use client";

import { Button } from "@/components/ui/button";
import { ListenShell } from "./listen-shell";

/**
 * Catches a genuine failure reading the query (al_public_query() erroring, an
 * unapplied migration, an outage). A broken read says so out loud rather than
 * rendering as "this page isn't available" — see CLAUDE.md on why a swallowed
 * Supabase error is a bug, not a fallback. Mirrors /join/[token]/error.tsx.
 *
 * The message is shown because a participant reporting "it says X" is the only
 * diagnostic channel this tool has: they cannot open a console and there is no
 * error reporting in this repository.
 */
export default function ListenError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ListenShell embedded={false}>
      <h1 className="font-serif text-[20px] font-bold text-ink-900">Something went wrong</h1>
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
    </ListenShell>
  );
}
