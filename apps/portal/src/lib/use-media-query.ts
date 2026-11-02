"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a CSS media query currently matches. False on the server and during
 * hydration, so it is for things that only exist after an interaction (a menu
 * that has to choose between a popover and a sheet when it opens) — layout that
 * must be right on first paint belongs in CSS breakpoints instead.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
