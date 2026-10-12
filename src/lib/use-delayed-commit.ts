"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Runs the latest scheduled task once the caller has stopped scheduling for `delayMs`.
 * Trimming is a hold-the-button interaction: the value moves on every tap and the write
 * waits for a pause, so eight nudge buttons are not eight round trips. A pending task is
 * dropped on unmount.
 */
export function useDelayedCommit(delayMs: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const schedule = useCallback(
    (task: () => void | Promise<void>) => {
      cancel();
      timer.current = setTimeout(() => {
        timer.current = null;
        void task();
      }, delayMs);
    },
    [cancel, delayMs],
  );

  useEffect(() => cancel, [cancel]);

  return { schedule, cancel };
}
