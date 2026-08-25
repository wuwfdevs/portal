"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

// A live-ticking "how long until X" countdown — the sidebar's rejoin/next-
// break widget's companion to StationClock's "what time is it right now",
// same pure client-side tick (setInterval, no server round-trip) so the
// number moves smoothly between LogPoller's 15s polls instead of sitting
// stale. Starts blank and fills in on mount rather than rendering the
// server's render-time instant, same hydration-mismatch avoidance as
// StationClock.

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function Countdown({
  targetISO,
  className,
  /** Once the target instant has passed, render in text-danger — for a deadline that shouldn't be missed (a break's own rejoin), not for a merely-approximate target (a floating break's earliest possible start). */
  dangerWhenPast = false,
}: {
  targetISO: string;
  className?: string;
  dangerWhenPast?: boolean;
}) {
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- filling in the client's own clock after mount, same as StationClock; the null placeholder avoids a hydration mismatch against the server's render-time instant.
    setNowMs(Date.now());
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (nowMs === null) {
    return (
      <span className={className} aria-live="off">
        --:--
      </span>
    );
  }

  const remainingSeconds = Math.round((new Date(targetISO).getTime() - nowMs) / 1000);
  const past = remainingSeconds < 0;

  return (
    <span className={cn(className, past && dangerWhenPast && "text-danger")} aria-live="off">
      {past ? "-" : ""}
      {formatDuration(Math.abs(remainingSeconds))}
    </span>
  );
}
