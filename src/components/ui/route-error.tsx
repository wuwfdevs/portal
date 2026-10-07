"use client";

import { Button } from "@/components/ui/button";

/**
 * The body of a route segment's `error.tsx`. A broken read says so out loud
 * instead of rendering as an empty list. Each segment's error.tsx stays a
 * one-liner that passes its tool's name.
 */
export function RouteError({
  toolName,
  error,
  reset,
  className = "max-w-xl",
}: {
  toolName: string;
  error: Error & { digest?: string };
  reset: () => void;
  className?: string;
}) {
  return (
    <div className={`${className} rounded border border-danger/30 bg-danger/[0.04] p-6`}>
      <h2 className="font-serif text-[17px] font-bold text-ink-900">
        {toolName} couldn&apos;t load
      </h2>
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
