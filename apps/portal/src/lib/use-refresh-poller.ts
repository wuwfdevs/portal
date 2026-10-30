"use client";

import { usePoller } from "@/lib/use-poller";

/**
 * Re-render the current server page on an interval (see `usePoller`, which this
 * is the refresh-only form of). Never overlaps itself: a tick is skipped while
 * `shouldSkip()` is true.
 */
export function useRefreshPoller(options: {
  intervalMs: number;
  enabled?: boolean;
  pauseWhenHidden?: boolean;
  shouldSkip?: () => boolean;
}) {
  usePoller(options);
}
