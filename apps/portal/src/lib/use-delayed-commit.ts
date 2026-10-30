"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Runs the latest scheduled task once the caller has stopped scheduling for `delayMs`.
 * Trimming is a hold-the-button interaction: the value moves on every tap and the write
 * waits for a pause, so eight nudge buttons are not eight round trips. A pending task is
 * dropped on unmount, unless `flushOnUnmount` runs it then instead: for a write the user has
 * already seen accepted, so closing the screen mid-delay must not lose it.
 */
export function useDelayedCommit(delayMs: number, { flushOnUnmount = false } = {}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<(() => void | Promise<void>) | null>(null);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
  }, []);

  const schedule = useCallback(
    (task: () => void | Promise<void>) => {
      cancel();
      pending.current = task;
      timer.current = setTimeout(() => {
        timer.current = null;
        pending.current = null;
        void task();
      }, delayMs);
    },
    [cancel, delayMs],
  );

  useEffect(
    () => () => {
      const task = pending.current;
      cancel();
      if (flushOnUnmount && task) void task();
    },
    [cancel, flushOnUnmount],
  );

  return { schedule, cancel };
}
