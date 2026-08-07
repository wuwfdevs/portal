"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Refreshes an NPR or weather screen on a short interval so the lazy-refresh
 * read (lib/log/npr.ts, lib/log/weather.ts) actually gets re-run and a stale
 * cache doesn't just sit there until someone happens to reload — the same
 * "console polls its own server" pattern docs/log-design.md §6 calls for,
 * matching src/app/(portal)/sourcework/[id]/processing-poller.tsx and the
 * waiting room's poll (there's still no notification layer in this repo).
 */
export function LogPoller({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);

  return null;
}
