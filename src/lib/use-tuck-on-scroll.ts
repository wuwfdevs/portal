"use client";

import { useEffect, useState } from "react";
import { INITIAL_TUCK, nextTuck, type TuckState } from "@/lib/tuck-on-scroll";

/**
 * True while a floating control (the assistant's bubble) should be tucked out of the way of what is
 * under it: scrolling down tucks it, scrolling up brings it back (`nextTuck`). It only acts below
 * `lg`, where the bubble can sit on a row's last button; leaving that width clears it at once, so a
 * rotated tablet never keeps a control that is no longer hidden out of the tab order.
 */
export function useTuckOnScroll(): boolean {
  const [tucked, setTucked] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023.98px)");
    let state: TuckState = { ...INITIAL_TUCK, anchor: window.scrollY };
    let frame = 0;

    function onScroll() {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (!query.matches) return;
        state = nextTuck(state, window.scrollY);
        setTucked(state.tucked);
      });
    }

    function onBreakpoint() {
      state = { ...INITIAL_TUCK, anchor: window.scrollY };
      setTucked(false);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    query.addEventListener("change", onBreakpoint);
    return () => {
      window.removeEventListener("scroll", onScroll);
      query.removeEventListener("change", onBreakpoint);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return tucked;
}
