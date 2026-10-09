"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CopyStatus = "idle" | "copied" | "failed";

/**
 * Copy text to the clipboard. A denied or unavailable clipboard (insecure
 * context, a blocked permission) comes back as `failed`, never as a rejected
 * promise. The status returns to `idle` after `resetMs`; the timer is cleared on
 * unmount.
 */
export function useCopyToClipboard(resetMs = 2000): {
  copy: (text: string) => Promise<boolean>;
  status: CopyStatus;
} {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string) => {
      let ok = false;
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch {
        ok = false;
      }
      setStatus(ok ? "copied" : "failed");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setStatus("idle"), resetMs);
      return ok;
    },
    [resetMs],
  );

  return { copy, status };
}
