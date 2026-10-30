"use client";

import { useEffect, useRef } from "react";

/**
 * Subscribe to an event for as long as the component is mounted (and `active`).
 * The handler is read through a ref, so an inline function never re-subscribes
 * and never runs stale. A null target (server render, a ref not yet set)
 * subscribes to nothing.
 */
export function useEventListener<E extends Event = Event>(
  target: EventTarget | null,
  type: string,
  handler: (event: E) => void,
  options: { active?: boolean; capture?: boolean; passive?: boolean } = {},
) {
  const { active = true, capture, passive } = options;
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!active || !target) return;
    const listener = (event: Event) => handlerRef.current(event as E);
    target.addEventListener(type, listener, { capture, passive });
    return () => target.removeEventListener(type, listener, { capture });
  }, [target, type, active, capture, passive]);
}

/**
 * Ask the browser to confirm before the tab closes or reloads while `active`
 * (work in flight that would be lost). Browsers show their own wording.
 */
export function useBeforeUnloadGuard(active: boolean) {
  useEventListener<BeforeUnloadEvent>(
    typeof window === "undefined" ? null : window,
    "beforeunload",
    (event) => {
      event.preventDefault();
      // Older browsers need a returnValue to show the prompt.
      event.returnValue = "";
    },
    { active },
  );
}
