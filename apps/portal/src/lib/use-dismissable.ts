"use client";

import { useEffect, useRef, type RefObject } from "react";

export type DismissReason = "outside" | "escape";

/**
 * Close a popup on an outside press or Escape. `refs` are every element that
 * counts as "inside" (a portaled panel needs its own ref besides its trigger's
 * container). The caller owns what dismissing means, including restoring
 * focus, in `onDismiss`. Listeners exist only while `open`; the latest
 * `onDismiss`/`refs` are read at event time, so an inline callback never
 * re-subscribes. `ignoreEscape` leaves Escape to the caller (a busy menu, or a
 * field that handles Escape itself). The triggering event is passed along for
 * a caller that must spare some outside targets.
 */
export function useDismissable({
  open,
  onDismiss,
  refs,
  event = "pointerdown",
  ignoreEscape = false,
}: {
  open: boolean;
  onDismiss: (reason: DismissReason, event: Event) => void;
  refs: RefObject<Element | null>[];
  event?: "pointerdown" | "mousedown";
  ignoreEscape?: boolean;
}) {
  const dismissRef = useRef(onDismiss);
  const refsRef = useRef(refs);
  useEffect(() => {
    dismissRef.current = onDismiss;
    refsRef.current = refs;
  });

  useEffect(() => {
    if (!open) return;
    function onPress(e: Event) {
      const target = e.target as Node | null;
      if (target && refsRef.current.some((ref) => ref.current?.contains(target))) return;
      dismissRef.current("outside", e);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") dismissRef.current("escape", e);
    }
    document.addEventListener(event, onPress);
    if (!ignoreEscape) document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener(event, onPress);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, event, ignoreEscape]);
}
