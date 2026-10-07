"use client";

import { RouteError } from "@/components/ui/route-error";

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
      <RouteError toolName="Sourcework" error={error} reset={reset} />
    </div>
  );
}
