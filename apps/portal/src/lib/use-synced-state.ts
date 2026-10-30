"use client";

import { useState } from "react";

/**
 * Local state seeded from a server value that must re-seed whenever the
 * server's copy changes.
 *
 * Plain `useState(props.value)` only reads the prop once. When a Server
 * Action changes a row and `router.refresh()` brings back new props, React
 * reuses the component instance (same list key) and the local copy silently
 * goes stale — the screen keeps showing the pre-action value, and any
 * "save if it differs from the prop" logic will happily write that stale
 * value back over the server's. That is exactly how a transcript split got
 * undone in production; see the transcript-workspace components.
 *
 * This is React's documented "adjust state during render" pattern: keep the
 * last server value in state and reset when it changes. Deliberately not a
 * `useEffect` (which would render the stale value for a frame first) and not
 * a changing `key` (which would remount and drop focus mid-edit).
 */
export function useSyncedState<T>(serverValue: T): [T, (next: T) => void] {
  const [value, setValue] = useState(serverValue);
  const [lastServerValue, setLastServerValue] = useState(serverValue);

  if (!Object.is(lastServerValue, serverValue)) {
    setLastServerValue(serverValue);
    setValue(serverValue);
  }

  return [value, setValue];
}
