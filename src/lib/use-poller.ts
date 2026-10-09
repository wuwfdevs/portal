"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Call `fn` every `ms` for as long as the component is mounted. `fn` is read
 * through a ref, so a plain clock never closes over stale state and an inline
 * callback never restarts the timer. `ms = null` pauses it.
 */
export function useInterval(fn: () => void, ms: number | null) {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  useEffect(() => {
    if (ms === null) return;
    const id = setInterval(() => fnRef.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}

/**
 * Re-render the current server page on an interval: the portal has no push
 * channel, so a screen waiting on something (a transcript, a waiting-room
 * admission) polls. By default each tick is `router.refresh()`. Give it a
 * `task` to check first (a browser-side read, say): the page is refreshed only
 * when the task resolves true, and a tick is skipped while the previous task is
 * still running, so a slow request never stacks up. Pauses while the tab is
 * hidden (`pauseWhenHidden`) and while `enabled` is false; it runs once when the
 * tab becomes visible again, and once at the start when `immediate`.
 * `shouldSkip` skips a tick without running anything.
 */
export function usePoller({
  intervalMs,
  enabled = true,
  pauseWhenHidden = true,
  immediate = false,
  shouldSkip,
  task,
}: {
  intervalMs: number;
  enabled?: boolean;
  pauseWhenHidden?: boolean;
  immediate?: boolean;
  shouldSkip?: () => boolean;
  /** Resolve true to refresh the page; false (or a throw) leaves it alone. */
  task?: () => Promise<boolean | void> | boolean | void;
}) {
  const router = useRouter();
  const skipRef = useRef(shouldSkip);
  const taskRef = useRef(task);
  useEffect(() => {
    skipRef.current = shouldSkip;
    taskRef.current = task;
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let running = false;

    const tick = async () => {
      if (pauseWhenHidden && document.visibilityState === "hidden") return;
      if (skipRef.current?.()) return;
      const run = taskRef.current;
      if (!run) {
        router.refresh();
        return;
      }
      if (running) return;
      running = true;
      try {
        const refresh = await run();
        if (!cancelled && refresh === true) router.refresh();
      } catch {
        // A failed tick (offline, a refused read) is retried on the next one.
      } finally {
        running = false;
      }
    };

    const id = setInterval(() => void tick(), intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    if (pauseWhenHidden) document.addEventListener("visibilitychange", onVisible);
    if (immediate) void tick();
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, intervalMs, enabled, pauseWhenHidden, immediate]);
}
