"use client";

import { useEffect, useState } from "react";
import { formatStationClockTime } from "@/lib/log/timezone";

/**
 * A live-ticking wall clock in the station's own timezone, hh:mm:ss — the
 * "what time is it right now" a host needs at a glance during a live
 * broadcast, distinct from any break's own scheduled time (which reads in
 * the same hh:mm:ss format, so the two are directly comparable). Pure
 * client-side tick (setInterval, no server round-trip, no poll): a clock is
 * the one display in this tool where a network request would only ever make
 * it less accurate, not more. Starts blank and fills in on mount rather than
 * rendering the server's own render-time instant, so it never shows a
 * momentarily-stale time or causes a hydration mismatch against the
 * client's clock.
 */
export function StationClock() {
  const [nowISO, setNowISO] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- filling in the client's own clock after mount; the null placeholder avoids rendering the server's render-time instant and causing a hydration mismatch.
    setNowISO(new Date().toISOString());
    const interval = setInterval(() => setNowISO(new Date().toISOString()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="rounded border-2 border-brand-primary bg-brand-surface/30 p-4">
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-400">Current time</div>
      <p className="font-mono text-4xl font-extrabold tabular-nums text-ink-900" aria-live="off">
        {nowISO ? formatStationClockTime(nowISO) : "--:--:--"}
      </p>
    </div>
  );
}
