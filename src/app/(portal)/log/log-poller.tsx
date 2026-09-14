"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { nextRefreshDelayMs } from "@/lib/log/console-timing";

/**
 * Re-renders a Log screen from the server without a manual reload, so the
 * lazy-refresh reads (lib/log/npr.ts, lib/log/weather.ts) get re-run once
 * their cache crosses its staleness threshold, and so another person's
 * edits or aired/missed marks eventually show up — the "console polls its
 * own server" pattern docs/log-design.md §6 calls for (there's still no
 * notification layer in this repo).
 *
 * Two things drive a refresh, and both are deliberately infrequent:
 *
 * - `intervalMs` is the fallback cadence. Nothing here needs to be fresher
 *   than minutes — NPR and weather are allowed to be 15 and 30 minutes old
 *   by their own thresholds — and every refresh of the rundown screen costs
 *   ~15 Supabase requests, which at a 15s tick (the original interval) was
 *   ~3,000 requests an hour from one open tab, enough to stall the
 *   station's small database instance outright (2026-09-14).
 * - `refreshAtISO` (the rundown screen, while live) lists the exact instants
 *   the server-computed live state can change — a break starting, a rejoin
 *   threshold crossing (lib/log/console-timing.ts's liveRefreshInstants) —
 *   so the current-break highlight and timing badge move *at* the boundary
 *   rather than up to a tick late, without a fixed short tick at all.
 *
 * The timer re-arms itself after each refresh rather than relying on the
 * re-render to re-run the effect, so a refresh that changes nothing still
 * keeps the loop alive.
 */
export function LogPoller({
  intervalMs,
  refreshAtISO,
}: {
  intervalMs: number;
  refreshAtISO?: string[];
}) {
  const router = useRouter();
  // A stable key so a re-render with the same schedule doesn't reset the
  // timer mid-wait.
  const instantsKey = refreshAtISO?.join("|") ?? "";

  useEffect(() => {
    const instants = instantsKey === "" ? [] : instantsKey.split("|");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      timer = setTimeout(
        () => {
          router.refresh();
          arm();
        },
        nextRefreshDelayMs(Date.now(), instants, intervalMs),
      );
    };
    arm();
    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [router, intervalMs, instantsKey]);

  return null;
}
