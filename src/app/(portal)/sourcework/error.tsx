"use client";

import { Button } from "@/components/ui/button";

/**
 * Catches read failures thrown by lib/transcription/{projects,clips}.ts. The
 * point is that a broken query says so, out loud, instead of rendering as an
 * empty project list or — worse — a transcript with no lines in it, which is
 * indistinguishable from a recording that came back silent.
 */
export default function TranscriptionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <div className="max-w-xl rounded border border-danger/30 bg-danger/[0.04] p-6">
        <h2 className="font-serif text-[17px] font-bold text-ink-900">
          Sourcework couldn&apos;t load
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-700">
          Something went wrong reading from the database. This is a problem with the tool, not with
          anything you did — your transcripts and excerpts are untouched.
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
    </div>
  );
}
