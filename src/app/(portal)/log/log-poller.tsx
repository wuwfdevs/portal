"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { nextRefreshDelayMs } from "@/lib/log/console-timing";
import { useOptionalBroadcastSync } from "./broadcast-sync";
import { pingLog } from "./broadcast-actions";

/** How long the reachability probe gets before a refresh is skipped. */
const PROBE_TIMEOUT_MS = 8_000;

/** Resolves true only if the server answers within the timeout. */
async function serverAnswers(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), PROBE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([pingLog().then(() => true as const), timeout]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

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
 *
 * A refresh is skipped — never attempted — when it could blank the screen
 * (2026-09-28, docs/log-design.md §6 "Host live-view resilience"): a
 * router.refresh() that can't reach the server, or gets a non-200 back,
 * falls back to a full browser navigation, which with no connection is the
 * browser's own "no internet" page in place of the rundown. So it checks
 * navigator.onLine, then a cheap probe (pingLog, no database), and on the
 * live rundown screen also waits while the offline queue is disconnected or
 * still sending — the queue refreshes the page itself once it empties, and
 * a refresh mid-queue would only show a state about to change.
 */
export function LogPoller({
  intervalMs,
  refreshAtISO,
}: {
  intervalMs: number;
  refreshAtISO?: string[];
}) {
  const router = useRouter();
  const sync = useOptionalBroadcastSync();
  const blocked = sync !== null && (!sync.connected || sync.pendingCount > 0);
  // Read by the timer callback, which outlives the render that armed it.
  const blockedRef = useRef(blocked);
  useEffect(() => {
    blockedRef.current = blocked;
  }, [blocked]);
  // A stable key so a re-render with the same schedule doesn't reset the
  // timer mid-wait.
  const instantsKey = refreshAtISO?.join("|") ?? "";

  useEffect(() => {
    const instants = instantsKey === "" ? [] : instantsKey.split("|");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      timer = setTimeout(
        () => {
          void (async () => {
            if (
              !blockedRef.current &&
              navigator.onLine &&
              (await serverAnswers()) &&
              !blockedRef.current
            ) {
              router.refresh();
            }
          })();
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
