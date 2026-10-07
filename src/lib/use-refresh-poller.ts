"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-render the current server page on an interval: the portal has no push
 * channel, so a screen waiting on something (a transcript, a waiting-room
 * admission) polls with `router.refresh()`. Pauses while the tab is hidden and
 * while `enabled` is false, and refreshes once when the tab becomes visible
 * again. Never overlaps itself: a tick is skipped while `shouldSkip()` is true.
 */
export function useRefreshPoller({
  intervalMs,
  enabled = true,
  pauseWhenHidden = true,
  shouldSkip,
}: {
  intervalMs: number;
  enabled?: boolean;
  pauseWhenHidden?: boolean;
  shouldSkip?: () => boolean;
}) {
  const router = useRouter();
  const skipRef = useRef(shouldSkip);
  useEffect(() => {
    skipRef.current = shouldSkip;
  });

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (pauseWhenHidden && document.visibilityState === "hidden") return;
      if (skipRef.current?.()) return;
      router.refresh();
    };
    const id = setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    if (pauseWhenHidden) document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, intervalMs, enabled, pauseWhenHidden]);
}
